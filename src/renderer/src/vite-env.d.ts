/// <reference types="vite/client" />

import type { ServiceCueApi } from "../../preload";

declare global {
  interface Window {
    serviceCue: ServiceCueApi;
  }
}
