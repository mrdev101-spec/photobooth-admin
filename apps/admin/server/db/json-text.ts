import { customType } from 'drizzle-orm/mysql-core';

/**
 * JSON column that works on MariaDB. MariaDB's JSON is an alias of LONGTEXT with a
 * JSON_VALID() check, so the driver returns a string where MySQL returns a parsed value.
 * This type parses strings on read and always writes JSON text.
 */
export const jsonText = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType() {
      return 'json';
    },
    toDriver(value: T): string {
      return JSON.stringify(value);
    },
    fromDriver(value: unknown): T {
      return (typeof value === 'string' ? JSON.parse(value) : value) as T;
    }
  })(name);
