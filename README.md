# Hello World

This is the default project that is scaffolded out when you run `npx @temporalio/create@latest ./myfolder`.

The [Hello World Tutorial](https://learn.temporal.io/getting_started/typescript/hello_world_in_typescript/) walks through the code in this sample.

### Running this sample

1. `temporal server start-dev` to start [Temporal Server](https://github.com/temporalio/cli/#installation).
1. `npm install` to install dependencies.
1. `npm run start.watch` to start the Worker.
1. In another shell, `npm run workflow` to run the Workflow Client.

The Workflow should return:

```bash
Hello, Temporal!
```

### Pointing at your own Temporal server

Both the worker and client now read connection settings from the standard Temporal environment variables provided by `@temporalio/envconfig`.

Common variables:

- `TEMPORAL_ADDRESS` for the gRPC frontend, for example `127.0.0.1:7233`
- `TEMPORAL_NAMESPACE` for the namespace to use, for example `default`
- `TEMPORAL_TASK_QUEUE` for this sample's task queue, defaults to `hello-world`
- `TEMPORAL_PROFILE` if you prefer loading a named profile from a Temporal CLI config file

Example:

```bash
export TEMPORAL_ADDRESS=127.0.0.1:7233
export TEMPORAL_NAMESPACE=default
export TEMPORAL_TASK_QUEUE=hello-world
npm run start.watch
```

In another shell with the same environment:

```bash
npm run workflow
```
