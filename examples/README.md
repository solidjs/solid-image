# Examples

Each folder is a small Vite app that uses `@solidjs/image` from this repository.

- [`lqip`](./lqip) shows a 20px copy of each image while it loads.
- [`blurhash`](./blurhash) shows a BlurHash of each image while it loads.

## Run an example

1. Install and build the package from the repository root.

   ```bash
   pnpm install
   pnpm build
   ```

2. Start an example.

   ```bash
   pnpm --filter @solidjs/image-example-lqip dev
   pnpm --filter @solidjs/image-example-blurhash dev
   ```

The examples use the built package. Run `pnpm build` again after you change `src`.

Local images load too fast to see the preview. Tick "Keep the previews on screen" to hold the images back, or throttle the network in the browser dev tools.

## Photos

The photos in `assets` come from [Unsplash](https://unsplash.com) and are free to use under the [Unsplash License](https://unsplash.com/license).

- `fjord.jpg` by [Alexey Topolyanskiy](https://unsplash.com/photos/-oWyJoSqBRM)
- `highlands.jpg` by [Andrew Ridley](https://unsplash.com/photos/Kt5hRENuotI)
- `sea.jpg` by [Paul Jarvis](https://unsplash.com/photos/6J--NXulQCs)
- `strawberries.jpg` by [veeterzy](https://unsplash.com/photos/OJJIaFZOeX4)
- `valley.jpg` by [Christian Joudrey](https://unsplash.com/photos/mWRR1xj95hg)
