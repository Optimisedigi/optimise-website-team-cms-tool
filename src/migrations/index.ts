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
import * as migration_20260325_120000_add_client_account_timeline from './20260325_120000_add_client_account_timeline';
import * as migration_20260327_120000_add_client_to_proposals from './20260327_120000_add_client_to_proposals';
import * as migration_20260401_120000_add_meeting_schedulers from './20260401_120000_add_meeting_schedulers';
import * as migration_20260407_120000_add_negative_list_builder from './20260407_120000_add_negative_list_builder';
import * as migration_20260409_120000_add_ad_copy_activity_fields from './20260409_120000_add_ad_copy_activity_fields';
import * as migration_20260410_120000_add_client_timeline_templates_and_client_timelines from './20260410_120000_add_client_timeline_templates_and_client_timelines';
import * as migration_20260411_120000_add_budget_and_extension_locked_docs from './20260411_120000_add_budget_and_extension_locked_docs';
import * as migration_20260411_130000_add_budget_extension_tables from './20260411_130000_add_budget_extension_tables';
import * as migration_20260411_140000_add_missing_ad_extensions_column from './20260411_140000_add_missing_ad_extensions_column';
import * as migration_20260411_150000_fix_budget_extension_tables from './20260411_150000_fix_budget_extension_tables';
import * as migration_20260412_120000_add_monthly_budget_to_google_ads_audits from './20260412_120000_add_monthly_budget_to_google_ads_audits';
import * as migration_20260412_130000_add_enabled_to_campaign_budgets from './20260412_130000_add_enabled_to_campaign_budgets';
import * as migration_20260415_120000_merge_timeline_into_processes from './20260415_120000_merge_timeline_into_processes';
import * as migration_20260420_120000_add_ai_visibility_snapshots from './20260420_120000_add_ai_visibility_snapshots';
import * as migration_20260420_130000_add_serp_displacement_collections from './20260420_130000_add_serp_displacement_collections';
import * as migration_20260420_140000_add_ai_visibility_serp_monitor_fields from './20260420_140000_add_ai_visibility_serp_monitor_fields';
import * as migration_20260423_120000_add_meeting_scheduler_day_schedule from './20260423_120000_add_meeting_scheduler_day_schedule';
import * as migration_20260425_120000_fix_meeting_attendees_id_type from './20260425_120000_fix_meeting_attendees_id_type';
import * as migration_20260426_120000_add_meeting_scheduler_date_overrides from './20260426_120000_add_meeting_scheduler_date_overrides';
import * as migration_20260428_120000_add_user_feature_access from './20260428_120000_add_user_feature_access';
import * as migration_20260429_120000_add_permission_profiles from './20260429_120000_add_permission_profiles';
import * as migration_20260429_140000_add_keyword_deep_dive_sessions from './20260429_140000_add_keyword_deep_dive_sessions';
import * as migration_20260430_120000_add_avoided_spend_cache from './20260430_120000_add_avoided_spend_cache';

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
  {
    up: migration_20260325_120000_add_client_account_timeline.up,
    down: migration_20260325_120000_add_client_account_timeline.down,
    name: '20260325_120000_add_client_account_timeline'
  },
  {
    up: migration_20260327_120000_add_client_to_proposals.up,
    down: migration_20260327_120000_add_client_to_proposals.down,
    name: '20260327_120000_add_client_to_proposals'
  },
  {
    up: migration_20260401_120000_add_meeting_schedulers.up,
    down: migration_20260401_120000_add_meeting_schedulers.down,
    name: '20260401_120000_add_meeting_schedulers'
  },
  {
    up: migration_20260407_120000_add_negative_list_builder.up,
    down: migration_20260407_120000_add_negative_list_builder.down,
    name: '20260407_120000_add_negative_list_builder'
  },
  {
    up: migration_20260409_120000_add_ad_copy_activity_fields.up,
    down: migration_20260409_120000_add_ad_copy_activity_fields.down,
    name: '20260409_120000_add_ad_copy_activity_fields'
  },
  {
    up: migration_20260410_120000_add_client_timeline_templates_and_client_timelines.up,
    down: migration_20260410_120000_add_client_timeline_templates_and_client_timelines.down,
    name: '20260410_120000_add_client_timeline_templates_and_client_timelines'
  },
  {
    up: migration_20260411_120000_add_budget_and_extension_locked_docs.up,
    down: migration_20260411_120000_add_budget_and_extension_locked_docs.down,
    name: '20260411_120000_add_budget_and_extension_locked_docs'
  },
  {
    up: migration_20260411_140000_add_missing_ad_extensions_column.up,
    down: migration_20260411_140000_add_missing_ad_extensions_column.down,
    name: '20260411_140000_add_missing_ad_extensions_column'
  },
  {
    up: migration_20260411_130000_add_budget_extension_tables.up,
    down: migration_20260411_130000_add_budget_extension_tables.down,
    name: '20260411_130000_add_budget_extension_tables'
  },
  {
    up: migration_20260411_150000_fix_budget_extension_tables.up,
    down: migration_20260411_150000_fix_budget_extension_tables.down,
    name: '20260411_150000_fix_budget_extension_tables'
  },
  {
    up: migration_20260412_120000_add_monthly_budget_to_google_ads_audits.up,
    down: migration_20260412_120000_add_monthly_budget_to_google_ads_audits.down,
    name: '20260412_120000_add_monthly_budget_to_google_ads_audits'
  },
  {
    up: migration_20260412_130000_add_enabled_to_campaign_budgets.up,
    down: migration_20260412_130000_add_enabled_to_campaign_budgets.down,
    name: '20260412_130000_add_enabled_to_campaign_budgets'
  },
  {
    up: migration_20260415_120000_merge_timeline_into_processes.up,
    down: migration_20260415_120000_merge_timeline_into_processes.down,
    name: '20260415_120000_merge_timeline_into_processes'
  },
  {
    up: migration_20260420_120000_add_ai_visibility_snapshots.up,
    down: migration_20260420_120000_add_ai_visibility_snapshots.down,
    name: '20260420_120000_add_ai_visibility_snapshots'
  },
  {
    up: migration_20260420_130000_add_serp_displacement_collections.up,
    down: migration_20260420_130000_add_serp_displacement_collections.down,
    name: '20260420_130000_add_serp_displacement_collections'
  },
  {
    up: migration_20260420_140000_add_ai_visibility_serp_monitor_fields.up,
    down: migration_20260420_140000_add_ai_visibility_serp_monitor_fields.down,
    name: '20260420_140000_add_ai_visibility_serp_monitor_fields'
  },
  {
    up: migration_20260423_120000_add_meeting_scheduler_day_schedule.up,
    down: migration_20260423_120000_add_meeting_scheduler_day_schedule.down,
    name: '20260423_120000_add_meeting_scheduler_day_schedule'
  },
  {
    up: migration_20260425_120000_fix_meeting_attendees_id_type.up,
    down: migration_20260425_120000_fix_meeting_attendees_id_type.down,
    name: '20260425_120000_fix_meeting_attendees_id_type'
  },
  {
    up: migration_20260426_120000_add_meeting_scheduler_date_overrides.up,
    down: migration_20260426_120000_add_meeting_scheduler_date_overrides.down,
    name: '20260426_120000_add_meeting_scheduler_date_overrides'
  },
  {
    up: migration_20260428_120000_add_user_feature_access.up,
    down: migration_20260428_120000_add_user_feature_access.down,
    name: '20260428_120000_add_user_feature_access'
  },
  {
    up: migration_20260429_120000_add_permission_profiles.up,
    down: migration_20260429_120000_add_permission_profiles.down,
    name: '20260429_120000_add_permission_profiles'
  },
  {
    up: migration_20260429_140000_add_keyword_deep_dive_sessions.up,
    down: migration_20260429_140000_add_keyword_deep_dive_sessions.down,
    name: '20260429_140000_add_keyword_deep_dive_sessions'
  },
  {
    up: migration_20260430_120000_add_avoided_spend_cache.up,
    down: migration_20260430_120000_add_avoided_spend_cache.down,
    name: '20260430_120000_add_avoided_spend_cache'
  },
];
