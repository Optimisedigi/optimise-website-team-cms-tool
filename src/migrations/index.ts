import * as migration_20260210_034208_add_client_analysis_fields from './20260210_034208_add_client_analysis_fields';
import * as migration_20260304_120000_add_gsc_indexing_audits from './20260304_120000_add_gsc_indexing_audits';
import * as migration_20260306_120000_add_contracts from './20260306_120000_add_contracts';
import * as migration_20260305_120000_contracts_signature_upload_template from './20260305_120000_contracts_signature_upload_template';
import * as migration_20260305_130000_add_content_researches_client from './20260305_130000_add_content_researches_client';

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
  {
    up: migration_20260306_120000_add_contracts.up,
    down: migration_20260306_120000_add_contracts.down,
    name: '20260306_120000_add_contracts'
  },
  {
    up: migration_20260305_120000_contracts_signature_upload_template.up,
    down: migration_20260305_120000_contracts_signature_upload_template.down,
    name: '20260305_120000_contracts_signature_upload_template'
  },
  {
    up: migration_20260305_130000_add_content_researches_client.up,
    down: migration_20260305_130000_add_content_researches_client.down,
    name: '20260305_130000_add_content_researches_client'
  },
];
