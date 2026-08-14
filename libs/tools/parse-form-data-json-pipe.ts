import { PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { deepParseJson } from 'deep-parse-json';
import * as _ from 'lodash';

interface TParseFormDataJsonOptions {
  except?: string[];
}

export class ParseFormDataJsonPipe implements PipeTransform {
  constructor(private options?: TParseFormDataJsonOptions) {}

  private parseJsonRecursively(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // If it's a string, try to parse it as JSON
    if (typeof obj === 'string') {
      try {
        const parsed = JSON.parse(obj);
        // Recursively parse the parsed value in case it contains more JSON strings
        return this.parseJsonRecursively(parsed);
      } catch {
        // If parsing fails, try wrapping in array brackets (handles comma-separated objects)
        // This handles cases like: "{...},{...}" which should become "[{...},{...}]"
        try {
          const trimmed = obj.trim();
          // Only try wrapping if it looks like it might be JSON objects
          if ((trimmed.startsWith('{') && trimmed.includes('}')) || trimmed.startsWith('[')) {
            const wrapped = trimmed.startsWith('[') ? trimmed : `[${trimmed}]`;
            const parsed = JSON.parse(wrapped);
            return this.parseJsonRecursively(parsed);
          }
        } catch {
          // If wrapping also fails, return the original string
        }
        // If parsing fails, return the original string
        return obj;
      }
    }

    // If it's an array, parse each element recursively
    if (Array.isArray(obj)) {
      return obj.map((item) => this.parseJsonRecursively(item));
    }

    // If it's an object, parse each property recursively
    if (typeof obj === 'object') {
      const parsed: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          parsed[key] = this.parseJsonRecursively(obj[key]);
        }
      }
      return parsed;
    }

    // For primitive values, return as is
    return obj;
  }

  transform(value: any, _metadata: ArgumentMetadata) {
    const except = this.options?.except;
    const serializedValue = value;
    const originProperties = {};
    if (except?.length) {
      _.merge(originProperties, _.pick(serializedValue, ...except));
    }

    // First use deepParseJson for initial parsing
    let deserializedValue = deepParseJson(value);

    // Then recursively parse any remaining JSON strings (especially in arrays)
    deserializedValue = this.parseJsonRecursively(deserializedValue);

    return { ...deserializedValue, ...originProperties };
  }
}
