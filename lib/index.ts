import { ClusterAdapterWithHeartbeat } from "socket.io-adapter";
import type {
  ClusterAdapterOptions,
  ClusterMessage,
  ClusterResponse,
  Offset,
  ServerId,
} from "socket.io-adapter";
import { encode, decode } from "@msgpack/msgpack";
import type {
  Topic,
  Message,
  CreateSubscriptionOptions,
} from "@google-cloud/pubsub";
import { randomBytes } from "node:crypto";

const debug = require("debug")("socket.io-gcloud-pubsub-adapter");

function randomId() {
  return randomBytes(8).toString("hex");
}

export interface AdapterOptions extends ClusterAdapterOptions {
  /**
   * The prefix for the new subscription to create
   * @default "socket.io"
   */
  subscriptionPrefix?: string;
  /**
   * The options used to create the subscription.
   */
  subscriptionOptions?: CreateSubscriptionOptions;
}

/**
 * Returns a function that will create a {@link PubSubAdapter} instance.
 *
 * @param topic - a Google pub/sub topic
 * @param opts - additional options
 *
 * @public
 */
export function createAdapter(topic: Topic, opts: AdapterOptions = {}) {
  const subscriptionPrefix = opts.subscriptionPrefix || "socket.io";
  const subscriptionName = `${subscriptionPrefix}-${randomId()}`;

  const namespaceToAdapters = new Map<string, PubSubAdapter>();

  debug("creating subscription [%s]", subscriptionName);

  // a new subscription is created every time, in order to always start at the last offset (and not replay old messages)
  const subscriptionCreation = topic
    .createSubscription(subscriptionName, opts.subscriptionOptions)
    .then((res) => {
      debug("subscription [%s] was successfully created", subscriptionName);
      const subscription = res[0];

      subscription.on("message", (message) => {
        const namespace = message.attributes["nsp"];

        namespaceToAdapters.get(namespace)?.onRawMessage(message);

        message.ack();
      });

      subscription.on("error", (err) => {
        debug("an error has occurred: %s", err.message);
      });
    })
    .catch((err) => {
      debug(
        "an error has occurred while creating the subscription: %s",
        err.message
      );
    });

  return function (nsp: any) {
    const adapter = new PubSubAdapter(nsp, topic, opts);

    namespaceToAdapters.set(nsp.name, adapter);

    const defaultInit = adapter.init;

    adapter.init = () => {
      return subscriptionCreation.then(() => {
        defaultInit.call(adapter);
      });
    };

    const defaultClose = adapter.close;

    adapter.close = () => {
      namespaceToAdapters.delete(nsp.name);

      if (namespaceToAdapters.size === 0) {
        debug("deleting subscription [%s]", subscriptionName);

        topic
          .subscription(subscriptionName)
          .delete()
          .then(() => {
            debug(
              "subscription [%s] was successfully deleted",
              subscriptionName
            );
          })
          .catch((err) => {
            debug(
              "an error has occurred while deleting the subscription: %s",
              err.message
            );
          });
      }

      defaultClose.call(adapter);
    };

    return adapter;
  };
}

export class PubSubAdapter extends ClusterAdapterWithHeartbeat {
  private readonly topic: Topic;
  /**
   * Adapter constructor.
   *
   * @param nsp - the namespace
   * @param topic - a Google pub/sub topic
   * @param opts - additional options
   *
   * @public
   */
  constructor(nsp: any, topic: Topic, opts: ClusterAdapterOptions) {
    super(nsp, opts);
    this.topic = topic;
  }

  protected doPublish(message: ClusterMessage): Promise<Offset> {
    return this.topic
      .publishMessage({
        data: Buffer.from(encode(message)),
        attributes: {
          nsp: this.nsp.name,
          uid: this.uid,
        },
      })
      .then();
  }

  protected doPublishResponse(
    requesterUid: ServerId,
    response: ClusterResponse
  ): Promise<void> {
    return this.topic
      .publishMessage({
        data: Buffer.from(encode(response)),
        attributes: {
          nsp: this.nsp.name,
          uid: this.uid,
          requesterUid,
        },
      })
      .then();
  }

  public onRawMessage(rawMessage: Message) {
    if (rawMessage.attributes["uid"] === this.uid) {
      debug("ignore message from self");
      return;
    }

    const requesterUid = rawMessage.attributes["requesterUid"];
    if (requesterUid && requesterUid !== this.uid) {
      debug("ignore response for another node");
      return;
    }

    const decoded = decode(rawMessage.data);
    debug("received %j", decoded);

    if (requesterUid) {
      this.onResponse(decoded as ClusterResponse);
    } else {
      this.onMessage(decoded as ClusterMessage);
    }
  }
}
