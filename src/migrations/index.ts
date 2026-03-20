import * as migration_20260210_034208_add_client_analysis_fields from './20260210_034208_add_client_analysis_fields';
import * as migration_20260304_120000_add_gsc_indexing_audits from './20260304_120000_add_gsc_indexing_audits';
import * as migration_20260306_120000_add_contracts from './20260306_120000_add_contracts';
import * as migration_20260305_120000_contracts_signature_upload_template from './20260305_120000_contracts_signature_upload_template';
import * as migration_20260305_130000_add_content_researches_client from './20260305_130000_add_content_researches_client';
import * as migration_20260307_120000_add_sales_leads from './20260307_120000_add_sales_leads';
import * as migration_20260307_130000_add_lead_attribution from './20260307_130000_add_lead_attribution';
import * as migration_20260308_120000_add_tag_setup_audits from './20260308_120000_add_tag_setup_audits';
import * as migration_20260310_120000_add_process_templates_and_client_processes from './20260310_120000_add_process_templates_and_client_processes';
import * as migration_20260312_120000_add_site_url_to_gsc_indexing_audits from './20260312_120000_add_site_url_to_gsc_indexing_audits';
import * as migration_20260320_120000_add_yearly_sales_target from './20260320_120000_add_yearly_sales_target';

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
  {
    up: migration_20260307_120000_add_sales_leads.up,
    down: migration_20260307_120000_add_sales_leads.down,
    name: '20260307_120000_add_sales_leads'
  },
  {
    up: migration_20260307_130000_add_lead_attribution.up,
    down: migration_20260307_130000_add_lead_attribution.down,
    name: '20260307_130000_add_lead_attribution'
  },
  {
    up: migration_20260308_120000_add_tag_setup_audits.up,
    down: migration_20260308_120000_add_tag_setup_audits.down,
    name: '20260308_120000_add_tag_setup_audits'
  },
  {
    up: migration_20260310_120000_add_process_templates_and_client_processes.up,
    down: migration_20260310_120000_add_process_templates_and_client_processes.down,
    name: '20260310_120000_add_process_templates_and_client_processes'
  },
  {
    up: migration_20260312_120000_add_site_url_to_gsc_indexing_audits.up,
    down: migration_20260312_120000_add_site_url_to_gsc_indexing_audits.down,
    name: '20260312_120000_add_site_url_to_gsc_indexing_audits'
  },
  {
    up: migration_20260320_120000_add_yearly_sales_target.up,
    down: migration_20260320_120000_add_yearly_sales_target.down,
    name: '20260320_120000_add_yearly_sales_target'
  },
];
