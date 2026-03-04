import * as migration_20260210_034208_add_client_analysis_fields from './20260210_034208_add_client_analysis_fields';
import * as migration_20260304_120000_add_gsc_indexing_audits from './20260304_120000_add_gsc_indexing_audits';

export const migrations = [
  {
    up: migration_20260210_034208_add_client_analysis_fields.up,
    down: migration_20260210_034208_add_client_analysis_fields.down,
    name: '20260210_034208_add_client_analysis_fields'
  },
  {
    up: migration_20260304_120000_add_gsc_indexing_audits.up,
    down: migration_20260304_120000_add_gsc_indexing_audits.down,
    name: '20260304_120000_add_gsc_indexing_audits'
  },
];
