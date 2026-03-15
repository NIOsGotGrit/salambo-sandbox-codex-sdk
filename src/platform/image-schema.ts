export type ImageConfig = {
  apt: string[];
  npm: string[];
  pip: string[];
  setup: string;
};

export function defineImage(config: ImageConfig): ImageConfig {
  return config;
}
