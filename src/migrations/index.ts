import * as migration_20260210_034208_add_client_analysis_fields from './20260210_034208_add_client_analysis_fields';

export const migrations = [
  {
    up: migration_20260210_034208_add_client_analysis_fields.up,
    down: migration_20260210_034208_add_client_analysis_fields.down,
    name: '20260210_034208_add_client_analysis_fields'
  },
];
