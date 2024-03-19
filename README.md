# Socket.IO Google Cloud pub/sub adapter

The `@socket.io/gcp-pubsub-adapter` package allows broadcasting packets between multiple Socket.IO servers.

**Table of contents**

- [Supported features](#supported-features)
- [Installation](#installation)
- [Usage](#usage)
- [Options](#options)
- [License](#license)

## Supported features

| Feature                         | `socket.io` version | Support                                        |
|---------------------------------|---------------------|------------------------------------------------|
| Socket management               | `4.0.0`             | :white_check_mark: YES (since version `0.1.0`) |
| Inter-server communication      | `4.1.0`             | :white_check_mark: YES (since version `0.1.0`) |
| Broadcast with acknowledgements | `4.5.0`             | :white_check_mark: YES (since version `0.1.0`) |
| Connection state recovery       | `4.6.0`             | :x: NO                                         |

## Installation

```
npm install @socket.io/gcp-pubsub-adapter
```

## Usage

```js
import { PubSub } from "@google-cloud/pubsub";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/gcp-pubsub-adapter";

const pubsub = new PubSub({
  projectId: "your-project-id"
});

const topic = pubsub.topic(topicNameOrId);

const io = new Server({
  adapter: createAdapter(topic)
});

// wait for the creation of the pub/sub subscription
await io.of("/").adapter.init();

io.listen(3000);
```

## Options

| Name                  | Description                                                                                                       | Default value  |
|-----------------------|-------------------------------------------------------------------------------------------------------------------|----------------|
| `subscriptionPrefix`  | The prefix for the new subscription to create.                                                                    | `socket.io`    |
| `subscriptionOptions` | The options used to create the subscription.                                                                      | `-`            |
| `heartbeatInterval`   | The number of ms between two heartbeats.                                                                          | `5_000`        |
| `heartbeatTimeout`    | The number of ms without heartbeat before we consider a node down.                                                | `10_000`       |

## License

[MIT](LICENSE)
