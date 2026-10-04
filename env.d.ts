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

declare module "*?image-url" {
  const url: string;

  export default url;
}

declare module "*&image-url" {
  const url: string;

  export default url;
}
