import type { JSX } from "@solidjs/web";
import { isServer } from "@solidjs/web";
import { createSignal, onSettled, Show } from "solid-js";

export const createClientSignal = isServer
  ? (): (() => boolean) => () => false
  : (): (() => boolean) => {
      const [flag, setFlag] = createSignal(false);

      // Runs once the component has settled in the browser.
      onSettled(() => {
        setFlag(true);
      });

      return flag;
    };

export interface ClientOnlyProps {
  fallback?: JSX.Element;
  children?: JSX.Element;
}

export const ClientOnly = (props: ClientOnlyProps): JSX.Element => {
  const isClient = createClientSignal();

  return (
    <Show when={isClient()} fallback={props.fallback}>
      {props.children}
    </Show>
  );
};
