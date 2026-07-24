declare module "image:*" {
  import type { SolidImageProps } from "@solidjs/image";

  const props: Pick<SolidImageProps<unknown>, "src" | "transformer">;

  export default props;
}

declare module "*?image" {
  import type { SolidImageProps } from "@solidjs/image";

  const props: Pick<SolidImageProps<unknown>, "src" | "transformer">;

  export default props;
}
