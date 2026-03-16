import imageConfig from '../../harness-config/docker';
import type { ImageConfig } from './image-schema';

let validated = false;

export function getImageConfig(): ImageConfig {
  if (!validated) {
    assertValidImageConfig(imageConfig);
    validated = true;
  }

  return imageConfig;
}

export function assertValidImageConfig(config: ImageConfig): void {
  const errors: string[] = [];

  validateStringArray(config.apt, 'apt', errors);
  validateStringArray(config.npm, 'npm', errors);
  validateStringArray(config.pip, 'pip', errors);

  if (typeof config.setup !== 'string') {
    errors.push('setup must be a string');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

function validateStringArray(value: unknown, field: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of strings`);
    return;
  }

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string') {
      errors.push(`${field}[${index}] must be a string`);
    }
  }
}
