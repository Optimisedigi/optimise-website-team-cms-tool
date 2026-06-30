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
import * as migration_20260501_120000_add_monthly_waste_relevancy_cache from './20260501_120000_add_monthly_waste_relevancy_cache';
import * as migration_20260505_120000_add_contractor_invoicing from './20260505_120000_add_contractor_invoicing';
import * as migration_20260505_140000_add_negative_sweep_candidates_lock from './20260505_140000_add_negative_sweep_candidates_lock';
import * as migration_20260505_150000_add_last_pushed_source_to_campaign_budgets from './20260505_150000_add_last_pushed_source_to_campaign_budgets';
import * as migration_20260505_160000_add_client_conversion_split_actions from './20260505_160000_add_client_conversion_split_actions';
import * as migration_20260505_180000_add_client_conversion_action_categories from './20260505_180000_add_client_conversion_action_categories';
import * as migration_20260506_120000_add_brand_spend_to_waste_relevancy_cache from './20260506_120000_add_brand_spend_to_waste_relevancy_cache';
import * as migration_20260508_120000_add_client_presentations from './20260508_120000_add_client_presentations';
import * as migration_20260508_180000_add_agent_collections from './20260508_180000_add_agent_collections';
import * as migration_20260509_120000_add_scheduled_agent_tasks from './20260509_120000_add_scheduled_agent_tasks';
import * as migration_20260511_120000_add_gsc_site_url_to_clients from './20260511_120000_add_gsc_site_url_to_clients';
import * as migration_20260512_120000_add_agent_memory_and_soul from './20260512_120000_add_agent_memory_and_soul';
import * as migration_20260513_120000_add_mission_priorities from './20260513_120000_add_mission_priorities';
import * as migration_20260514_120000_add_roadmap_and_commercial_and_launch from './20260514_120000_add_roadmap_and_commercial_and_launch';
import * as migration_20260515_120000_rename_roadmap_cells_desc_to_body from './20260515_120000_rename_roadmap_cells_desc_to_body';
import * as migration_20260512_140000_add_optimate_chat_turns from './20260512_140000_add_optimate_chat_turns';
import * as migration_20260513_130000_add_client_proposal_presentations from './20260513_130000_add_client_proposal_presentations';
import * as migration_20260513_160000_add_cro_key_findings from './20260513_160000_add_cro_key_findings';
import * as migration_20260516_120000_add_standalone_to_campaign_budgets from './20260516_120000_add_standalone_to_campaign_budgets';
import * as migration_20260517_120000_add_deck_url_and_deck_templates from './20260517_120000_add_deck_url_and_deck_templates';
import * as migration_20260518_120000_fix_sales_leads_array_id_types from './20260518_120000_fix_sales_leads_array_id_types';
import * as migration_20260518_130000_add_proposal_notes_and_timeline from './20260518_130000_add_proposal_notes_and_timeline';
import * as migration_20260519_120000_add_invoice_statement_drafts from './20260519_120000_add_invoice_statement_drafts';
import * as migration_20260520_120000_add_pin_rate_limits from './20260520_120000_add_pin_rate_limits';
import * as migration_20260521_120000_add_meta_ad_account_id_to_clients from './20260521_120000_add_meta_ad_account_id_to_clients';
import * as migration_20260522_120000_add_proposal_serp_ai_visibility_fields from './20260522_120000_add_proposal_serp_ai_visibility_fields';
import * as migration_20260523_120000_add_agent_approval_notifications_links from './20260523_120000_add_agent_approval_notifications_links';
import * as migration_20260524_130000_drop_clients_gsc_site_url from './20260524_130000_drop_clients_gsc_site_url';
import * as migration_20260524_140000_add_clients_additional_contacts from './20260524_140000_add_clients_additional_contacts';
import * as migration_20260524_120000_make_presentations_deck_slug_nullable from './20260524_120000_make_presentations_deck_slug_nullable';
import * as migration_20260525_120000_add_contract_end_date from './20260525_120000_add_contract_end_date';
import * as migration_20260525_140000_add_contract_client_acn_and_address from './20260525_140000_add_contract_client_acn_and_address';
import * as migration_20260526_120000_add_trading_names from './20260526_120000_add_trading_names';
import * as migration_20260527_120000_add_proposal_id_to_visibility_snapshots from './20260527_120000_add_proposal_id_to_visibility_snapshots';
import * as migration_20260528_120000_add_client_discovery_briefings from './20260528_120000_add_client_discovery_briefings';
import * as migration_20260529_120000_drop_proposal_discovery_notes from './20260529_120000_drop_proposal_discovery_notes';
import * as migration_20260530_120000_add_discovery_briefing_require_pin from './20260530_120000_add_discovery_briefing_require_pin';
import * as migration_20260531_120000_sync_locked_docs_rels from './20260531_120000_sync_locked_docs_rels';
import * as migration_20260601_120000_add_goal_runs_scheduler_fields from './20260601_120000_add_goal_runs_scheduler_fields';
import * as migration_20260602_120000_add_match_type_violation_tables from './20260602_120000_add_match_type_violation_tables';
import * as migration_20260603_120000_add_goal_runs_parameters from './20260603_120000_add_goal_runs_parameters';
import * as migration_20260604_120000_add_goal_risk_tiers_and_seed from './20260604_120000_add_goal_risk_tiers_and_seed';
import * as migration_20260605_120000_add_conversion_tracking_enabled_from from './20260605_120000_add_conversion_tracking_enabled_from';
import * as migration_20260605_130000_seed_account_efficiency_pause_risk_tiers from './20260605_130000_seed_account_efficiency_pause_risk_tiers';
import * as migration_20260606_120000_add_google_ads_starter_email_templates from './20260606_120000_add_google_ads_starter_email_templates';
import * as migration_20260606_130000_add_spend_policy_fields from './20260606_130000_add_spend_policy_fields';
import * as migration_20260607_120000_add_optimate_settings_global from './20260607_120000_add_optimate_settings_global';
import * as migration_20260608_120000_add_budget_recommendation_fields from './20260608_120000_add_budget_recommendation_fields';
import * as migration_20260610_120000_add_seo_audit_proposals from './20260610_120000_add_seo_audit_proposals';
import * as migration_20260611_120000_add_presented_by_fields from './20260611_120000_add_presented_by_fields';
import * as migration_20260612_120000_seo_proposal_relationships_and_pin from './20260612_120000_seo_proposal_relationships_and_pin';
import * as migration_20260613_120000_add_blog_settings_and_client_tone from './20260613_120000_add_blog_settings_and_client_tone';
import * as migration_20260614_120000_add_client_growth_hub from './20260614_120000_add_client_growth_hub';
import * as migration_20260615_120000_add_seo_migration_checks from './20260615_120000_add_seo_migration_checks';
import * as migration_20260616_120000_add_managed_google_ads_toggle from './20260616_120000_add_managed_google_ads_toggle';
import * as migration_20260617_120000_add_client_logo from './20260617_120000_add_client_logo';
import * as migration_20260618_120000_add_clients_services from './20260618_120000_add_clients_services';
import * as migration_20260618_130000_add_google_ads_change_trackers from './20260618_130000_add_google_ads_change_trackers';
import * as migration_20260618_140000_fix_clients_services_id_type from './20260618_140000_fix_clients_services_id_type';
import * as migration_20260619_120000_add_agent_memory_review_fields from './20260619_120000_add_agent_memory_review_fields';
import * as migration_20260620_120000_add_optimate_chat_turns_mode from './20260620_120000_add_optimate_chat_turns_mode';
import * as migration_20260621_120000_add_contact_phone_fields from './20260621_120000_add_contact_phone_fields';
import * as migration_20260624_120000_add_scheduled_task_type from './20260624_120000_add_scheduled_task_type';
import * as migration_20260625_120000_add_scheduled_task_friendly_schedule from './20260625_120000_add_scheduled_task_friendly_schedule';
import * as migration_20260626_120000_add_scheduled_task_clients_covered from './20260626_120000_add_scheduled_task_clients_covered';
import * as migration_20260627_120000_add_client_type from './20260627_120000_add_client_type';
import * as migration_20260628_120000_add_agency_kpi_snapshots from './20260628_120000_add_agency_kpi_snapshots';
import * as migration_20260629_120000_add_client_metric_snapshots from './20260629_120000_add_client_metric_snapshots';
import * as migration_20260629_120000_add_optimate_chat_history_token_limit from './20260629_120000_add_optimate_chat_history_token_limit';
import * as migration_20260630_120000_add_relevancy_exclusion_buckets from './20260630_120000_add_relevancy_exclusion_buckets';
import * as migration_20260701_120000_add_monthly_keyword_selection from './20260701_120000_add_monthly_keyword_selection';
import * as migration_20260701_120000_add_client_pulse from './20260701_120000_add_client_pulse';
import * as migration_20260604_120000_add_internal_confirmed_meeting_attendees from './20260604_120000_add_internal_confirmed_meeting_attendees';
import * as migration_20260702_120000_add_meeting_attendee_response from './20260702_120000_add_meeting_attendee_response';
import * as migration_20260703_120000_add_meeting_attendee_delivery_status from './20260703_120000_add_meeting_attendee_delivery_status';
import * as migration_20260704_120000_add_monthly_keyword_watch_fields from './20260704_120000_add_monthly_keyword_watch_fields';
import * as migration_20260705_120000_add_monthly_keyword_review_comment_fields from './20260705_120000_add_monthly_keyword_review_comment_fields';
import * as migration_20260706_120000_add_low_relevancy_exclusion_bucket from './20260706_120000_add_low_relevancy_exclusion_bucket';
import * as migration_20260706_120000_add_monthly_keyword_row_index from './20260706_120000_add_monthly_keyword_row_index';
import * as migration_20260707_120000_add_monthly_keyword_removed_fields from './20260707_120000_add_monthly_keyword_removed_fields';
import * as migration_20260708_120000_add_monthly_keyword_review_dismissed_fields from './20260708_120000_add_monthly_keyword_review_dismissed_fields';
import * as migration_20260709_120000_add_monthly_keyword_outcome_fields from './20260709_120000_add_monthly_keyword_outcome_fields';
import * as migration_20260710_120000_add_client_pulse_analytics_metrics from './20260710_120000_add_client_pulse_analytics_metrics';
import * as migration_20260711_120000_add_client_pulse_history from './20260711_120000_add_client_pulse_history';
import * as migration_20260711_130000_fix_mtvc_assigned_list_relationship_column from './20260711_130000_fix_mtvc_assigned_list_relationship_column';
import * as migration_20260711_140000_null_empty_mtvc_recommended_match_type from './20260711_140000_null_empty_mtvc_recommended_match_type';
import * as migration_20260712_120000_add_mtvc_added_as_keyword_fields from './20260712_120000_add_mtvc_added_as_keyword_fields';
import * as migration_20260713_120000_add_optimate_starter_questions from './20260713_120000_add_optimate_starter_questions';
import * as migration_20260714_120000_add_optimate_voice_realtime_model from './20260714_120000_add_optimate_voice_realtime_model';
import * as migration_20260715_120000_add_agent_soul_applies_to from './20260715_120000_add_agent_soul_applies_to';
import * as migration_20260716_120000_add_realtime_voice_usage from './20260716_120000_add_realtime_voice_usage';
import * as migration_20260717_120000_add_notification_hot_path_indexes from './20260717_120000_add_notification_hot_path_indexes';
import * as migration_20260718_120000_add_team_tasks from './20260718_120000_add_team_tasks';
import * as migration_20260719_120000_add_team_task_comments from './20260719_120000_add_team_task_comments';
import * as migration_20260720_120000_add_negative_keyword_campaign_count from './20260720_120000_add_negative_keyword_campaign_count';
import * as migration_20260720_130000_refresh_negative_keyword_campaign_counts from './20260720_130000_refresh_negative_keyword_campaign_counts';
import * as migration_20260721_120000_add_optimate_email_assistant_model from './20260721_120000_add_optimate_email_assistant_model';
import * as migration_20260722_120000_add_missing_client_business_fields from './20260722_120000_add_missing_client_business_fields';
import * as migration_20260723_120000_add_soul_rows_from_tone_md from './20260723_120000_add_soul_rows_from_tone_md';
import * as migration_20260724_120000_add_monthly_keyword_selection_rows from './20260724_120000_add_monthly_keyword_selection_rows';
import * as migration_20260725_120000_add_match_type_synonym_rules from './20260725_120000_add_match_type_synonym_rules';
import * as migration_20260726_120000_add_match_type_allow_list_terms from './20260726_120000_add_match_type_allow_list_terms';
import * as migration_20260727_120000_add_client_overview from './20260727_120000_add_client_overview';
import * as migration_20260728_120000_add_client_wishlist_items from './20260728_120000_add_client_wishlist_items';
import * as migration_20260728_130000_expand_client_wishlist_items from './20260728_130000_expand_client_wishlist_items';
import * as migration_20260729_120000_add_client_proposal_keyword_research_jobs from './20260729_120000_add_client_proposal_keyword_research_jobs';

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
  {
    up: migration_20260501_120000_add_monthly_waste_relevancy_cache.up,
    down: migration_20260501_120000_add_monthly_waste_relevancy_cache.down,
    name: '20260501_120000_add_monthly_waste_relevancy_cache'
  },
  {
    up: migration_20260505_120000_add_contractor_invoicing.up,
    down: migration_20260505_120000_add_contractor_invoicing.down,
    name: '20260505_120000_add_contractor_invoicing'
  },
  {
    up: migration_20260505_140000_add_negative_sweep_candidates_lock.up,
    down: migration_20260505_140000_add_negative_sweep_candidates_lock.down,
    name: '20260505_140000_add_negative_sweep_candidates_lock'
  },
  {
    up: migration_20260505_150000_add_last_pushed_source_to_campaign_budgets.up,
    down: migration_20260505_150000_add_last_pushed_source_to_campaign_budgets.down,
    name: '20260505_150000_add_last_pushed_source_to_campaign_budgets'
  },
  {
    up: migration_20260505_160000_add_client_conversion_split_actions.up,
    down: migration_20260505_160000_add_client_conversion_split_actions.down,
    name: '20260505_160000_add_client_conversion_split_actions'
  },
  {
    up: migration_20260505_180000_add_client_conversion_action_categories.up,
    down: migration_20260505_180000_add_client_conversion_action_categories.down,
    name: '20260505_180000_add_client_conversion_action_categories'
  },
  {
    up: migration_20260506_120000_add_brand_spend_to_waste_relevancy_cache.up,
    down: migration_20260506_120000_add_brand_spend_to_waste_relevancy_cache.down,
    name: '20260506_120000_add_brand_spend_to_waste_relevancy_cache'
  },
  {
    up: migration_20260508_120000_add_client_presentations.up,
    down: migration_20260508_120000_add_client_presentations.down,
    name: '20260508_120000_add_client_presentations'
  },
  {
    up: migration_20260508_180000_add_agent_collections.up,
    down: migration_20260508_180000_add_agent_collections.down,
    name: '20260508_180000_add_agent_collections'
  },
  {
    up: migration_20260509_120000_add_scheduled_agent_tasks.up,
    down: migration_20260509_120000_add_scheduled_agent_tasks.down,
    name: '20260509_120000_add_scheduled_agent_tasks'
  },
  {
    up: migration_20260511_120000_add_gsc_site_url_to_clients.up,
    down: migration_20260511_120000_add_gsc_site_url_to_clients.down,
    name: '20260511_120000_add_gsc_site_url_to_clients'
  },
  {
    up: migration_20260512_120000_add_agent_memory_and_soul.up,
    down: migration_20260512_120000_add_agent_memory_and_soul.down,
    name: '20260512_120000_add_agent_memory_and_soul'
  },
  {
    up: migration_20260513_120000_add_mission_priorities.up,
    down: migration_20260513_120000_add_mission_priorities.down,
    name: '20260513_120000_add_mission_priorities'
  },
  {
    up: migration_20260514_120000_add_roadmap_and_commercial_and_launch.up,
    down: migration_20260514_120000_add_roadmap_and_commercial_and_launch.down,
    name: '20260514_120000_add_roadmap_and_commercial_and_launch'
  },
  {
    up: migration_20260515_120000_rename_roadmap_cells_desc_to_body.up,
    down: migration_20260515_120000_rename_roadmap_cells_desc_to_body.down,
    name: '20260515_120000_rename_roadmap_cells_desc_to_body'
  },
  {
    up: migration_20260512_140000_add_optimate_chat_turns.up,
    down: migration_20260512_140000_add_optimate_chat_turns.down,
    name: '20260512_140000_add_optimate_chat_turns'
  },
  {
    up: migration_20260513_130000_add_client_proposal_presentations.up,
    down: migration_20260513_130000_add_client_proposal_presentations.down,
    name: '20260513_130000_add_client_proposal_presentations'
  },
  {
    up: migration_20260513_160000_add_cro_key_findings.up,
    down: migration_20260513_160000_add_cro_key_findings.down,
    name: '20260513_160000_add_cro_key_findings'
  },
  {
    up: migration_20260516_120000_add_standalone_to_campaign_budgets.up,
    down: migration_20260516_120000_add_standalone_to_campaign_budgets.down,
    name: '20260516_120000_add_standalone_to_campaign_budgets'
  },
  {
    up: migration_20260517_120000_add_deck_url_and_deck_templates.up,
    down: migration_20260517_120000_add_deck_url_and_deck_templates.down,
    name: '20260517_120000_add_deck_url_and_deck_templates'
  },
  {
    up: migration_20260518_120000_fix_sales_leads_array_id_types.up,
    down: migration_20260518_120000_fix_sales_leads_array_id_types.down,
    name: '20260518_120000_fix_sales_leads_array_id_types'
  },
  {
    up: migration_20260518_130000_add_proposal_notes_and_timeline.up,
    down: migration_20260518_130000_add_proposal_notes_and_timeline.down,
    name: '20260518_130000_add_proposal_notes_and_timeline'
  },
  {
    up: migration_20260519_120000_add_invoice_statement_drafts.up,
    down: migration_20260519_120000_add_invoice_statement_drafts.down,
    name: '20260519_120000_add_invoice_statement_drafts'
  },
  {
    up: migration_20260520_120000_add_pin_rate_limits.up,
    down: migration_20260520_120000_add_pin_rate_limits.down,
    name: '20260520_120000_add_pin_rate_limits'
  },
  {
    up: migration_20260521_120000_add_meta_ad_account_id_to_clients.up,
    down: migration_20260521_120000_add_meta_ad_account_id_to_clients.down,
    name: '20260521_120000_add_meta_ad_account_id_to_clients'
  },
  {
    up: migration_20260522_120000_add_proposal_serp_ai_visibility_fields.up,
    down: migration_20260522_120000_add_proposal_serp_ai_visibility_fields.down,
    name: '20260522_120000_add_proposal_serp_ai_visibility_fields'
  },
  {
    up: migration_20260523_120000_add_agent_approval_notifications_links.up,
    down: migration_20260523_120000_add_agent_approval_notifications_links.down,
    name: '20260523_120000_add_agent_approval_notifications_links'
  },
  {
    up: migration_20260524_130000_drop_clients_gsc_site_url.up,
    down: migration_20260524_130000_drop_clients_gsc_site_url.down,
    name: '20260524_130000_drop_clients_gsc_site_url'
  },
  {
    up: migration_20260524_140000_add_clients_additional_contacts.up,
    down: migration_20260524_140000_add_clients_additional_contacts.down,
    name: '20260524_140000_add_clients_additional_contacts'
  },
  {
    up: migration_20260524_120000_make_presentations_deck_slug_nullable.up,
    down: migration_20260524_120000_make_presentations_deck_slug_nullable.down,
    name: '20260524_120000_make_presentations_deck_slug_nullable'
  },
  {
    up: migration_20260525_120000_add_contract_end_date.up,
    down: migration_20260525_120000_add_contract_end_date.down,
    name: '20260525_120000_add_contract_end_date'
  },
  {
    up: migration_20260525_140000_add_contract_client_acn_and_address.up,
    down: migration_20260525_140000_add_contract_client_acn_and_address.down,
    name: '20260525_140000_add_contract_client_acn_and_address'
  },
  {
    up: migration_20260526_120000_add_trading_names.up,
    down: migration_20260526_120000_add_trading_names.down,
    name: '20260526_120000_add_trading_names'
  },
  {
    up: migration_20260527_120000_add_proposal_id_to_visibility_snapshots.up,
    down: migration_20260527_120000_add_proposal_id_to_visibility_snapshots.down,
    name: '20260527_120000_add_proposal_id_to_visibility_snapshots'
  },
  {
    up: migration_20260528_120000_add_client_discovery_briefings.up,
    down: migration_20260528_120000_add_client_discovery_briefings.down,
    name: '20260528_120000_add_client_discovery_briefings'
  },
  {
    up: migration_20260529_120000_drop_proposal_discovery_notes.up,
    down: migration_20260529_120000_drop_proposal_discovery_notes.down,
    name: '20260529_120000_drop_proposal_discovery_notes'
  },
  {
    up: migration_20260530_120000_add_discovery_briefing_require_pin.up,
    down: migration_20260530_120000_add_discovery_briefing_require_pin.down,
    name: '20260530_120000_add_discovery_briefing_require_pin'
  },
  {
    up: migration_20260531_120000_sync_locked_docs_rels.up,
    down: migration_20260531_120000_sync_locked_docs_rels.down,
    name: '20260531_120000_sync_locked_docs_rels'
  },
  {
    up: migration_20260601_120000_add_goal_runs_scheduler_fields.up,
    down: migration_20260601_120000_add_goal_runs_scheduler_fields.down,
    name: '20260601_120000_add_goal_runs_scheduler_fields'
  },
  {
    up: migration_20260602_120000_add_match_type_violation_tables.up,
    down: migration_20260602_120000_add_match_type_violation_tables.down,
    name: '20260602_120000_add_match_type_violation_tables'
  },
  {
    up: migration_20260603_120000_add_goal_runs_parameters.up,
    down: migration_20260603_120000_add_goal_runs_parameters.down,
    name: '20260603_120000_add_goal_runs_parameters'
  },
  {
    up: migration_20260604_120000_add_goal_risk_tiers_and_seed.up,
    down: migration_20260604_120000_add_goal_risk_tiers_and_seed.down,
    name: '20260604_120000_add_goal_risk_tiers_and_seed'
  },
  {
    up: migration_20260605_120000_add_conversion_tracking_enabled_from.up,
    down: migration_20260605_120000_add_conversion_tracking_enabled_from.down,
    name: '20260605_120000_add_conversion_tracking_enabled_from'
  },
  {
    up: migration_20260605_130000_seed_account_efficiency_pause_risk_tiers.up,
    down: migration_20260605_130000_seed_account_efficiency_pause_risk_tiers.down,
    name: '20260605_130000_seed_account_efficiency_pause_risk_tiers'
  },
  {
    up: migration_20260606_120000_add_google_ads_starter_email_templates.up,
    down: migration_20260606_120000_add_google_ads_starter_email_templates.down,
    name: '20260606_120000_add_google_ads_starter_email_templates'
  },
  {
    up: migration_20260606_130000_add_spend_policy_fields.up,
    down: migration_20260606_130000_add_spend_policy_fields.down,
    name: '20260606_130000_add_spend_policy_fields'
  },
  {
    up: migration_20260607_120000_add_optimate_settings_global.up,
    down: migration_20260607_120000_add_optimate_settings_global.down,
    name: '20260607_120000_add_optimate_settings_global'
  },
  {
    up: migration_20260608_120000_add_budget_recommendation_fields.up,
    down: migration_20260608_120000_add_budget_recommendation_fields.down,
    name: '20260608_120000_add_budget_recommendation_fields'
  },
  {
    up: migration_20260610_120000_add_seo_audit_proposals.up,
    down: migration_20260610_120000_add_seo_audit_proposals.down,
    name: '20260610_120000_add_seo_audit_proposals'
  },
  {
    up: migration_20260611_120000_add_presented_by_fields.up,
    down: migration_20260611_120000_add_presented_by_fields.down,
    name: '20260611_120000_add_presented_by_fields'
  },
  {
    up: migration_20260612_120000_seo_proposal_relationships_and_pin.up,
    down: migration_20260612_120000_seo_proposal_relationships_and_pin.down,
    name: '20260612_120000_seo_proposal_relationships_and_pin'
  },
  {
    up: migration_20260613_120000_add_blog_settings_and_client_tone.up,
    down: migration_20260613_120000_add_blog_settings_and_client_tone.down,
    name: '20260613_120000_add_blog_settings_and_client_tone'
  },
  {
    up: migration_20260614_120000_add_client_growth_hub.up,
    down: migration_20260614_120000_add_client_growth_hub.down,
    name: '20260614_120000_add_client_growth_hub'
  },
  {
    up: migration_20260615_120000_add_seo_migration_checks.up,
    down: migration_20260615_120000_add_seo_migration_checks.down,
    name: '20260615_120000_add_seo_migration_checks'
  },
  {
    up: migration_20260616_120000_add_managed_google_ads_toggle.up,
    down: migration_20260616_120000_add_managed_google_ads_toggle.down,
    name: '20260616_120000_add_managed_google_ads_toggle'
  },
  {
    up: migration_20260617_120000_add_client_logo.up,
    down: migration_20260617_120000_add_client_logo.down,
    name: '20260617_120000_add_client_logo'
  },
  {
    up: migration_20260618_120000_add_clients_services.up,
    down: migration_20260618_120000_add_clients_services.down,
    name: '20260618_120000_add_clients_services'
  },
  {
    up: migration_20260618_130000_add_google_ads_change_trackers.up,
    down: migration_20260618_130000_add_google_ads_change_trackers.down,
    name: '20260618_130000_add_google_ads_change_trackers'
  },
  {
    up: migration_20260618_140000_fix_clients_services_id_type.up,
    down: migration_20260618_140000_fix_clients_services_id_type.down,
    name: '20260618_140000_fix_clients_services_id_type'
  },
  {
    up: migration_20260619_120000_add_agent_memory_review_fields.up,
    down: migration_20260619_120000_add_agent_memory_review_fields.down,
    name: '20260619_120000_add_agent_memory_review_fields'
  },
  {
    up: migration_20260620_120000_add_optimate_chat_turns_mode.up,
    down: migration_20260620_120000_add_optimate_chat_turns_mode.down,
    name: '20260620_120000_add_optimate_chat_turns_mode'
  },
  {
    up: migration_20260621_120000_add_contact_phone_fields.up,
    down: migration_20260621_120000_add_contact_phone_fields.down,
    name: '20260621_120000_add_contact_phone_fields'
  },
  {
    up: migration_20260624_120000_add_scheduled_task_type.up,
    down: migration_20260624_120000_add_scheduled_task_type.down,
    name: '20260624_120000_add_scheduled_task_type'
  },
  {
    up: migration_20260625_120000_add_scheduled_task_friendly_schedule.up,
    down: migration_20260625_120000_add_scheduled_task_friendly_schedule.down,
    name: '20260625_120000_add_scheduled_task_friendly_schedule'
  },
  {
    up: migration_20260626_120000_add_scheduled_task_clients_covered.up,
    down: migration_20260626_120000_add_scheduled_task_clients_covered.down,
    name: '20260626_120000_add_scheduled_task_clients_covered'
  },
  {
    up: migration_20260627_120000_add_client_type.up,
    down: migration_20260627_120000_add_client_type.down,
    name: '20260627_120000_add_client_type'
  },
  {
    up: migration_20260628_120000_add_agency_kpi_snapshots.up,
    down: migration_20260628_120000_add_agency_kpi_snapshots.down,
    name: '20260628_120000_add_agency_kpi_snapshots'
  },
  {
    up: migration_20260629_120000_add_client_metric_snapshots.up,
    down: migration_20260629_120000_add_client_metric_snapshots.down,
    name: '20260629_120000_add_client_metric_snapshots'
  },
  {
    up: migration_20260629_120000_add_optimate_chat_history_token_limit.up,
    down: migration_20260629_120000_add_optimate_chat_history_token_limit.down,
    name: '20260629_120000_add_optimate_chat_history_token_limit'
  },
  {
    up: migration_20260630_120000_add_relevancy_exclusion_buckets.up,
    down: migration_20260630_120000_add_relevancy_exclusion_buckets.down,
    name: '20260630_120000_add_relevancy_exclusion_buckets'
  },
  {
    up: migration_20260701_120000_add_monthly_keyword_selection.up,
    down: migration_20260701_120000_add_monthly_keyword_selection.down,
    name: '20260701_120000_add_monthly_keyword_selection'
  },
  {
    up: migration_20260701_120000_add_client_pulse.up,
    down: migration_20260701_120000_add_client_pulse.down,
    name: '20260701_120000_add_client_pulse'
  },
  {
    up: migration_20260604_120000_add_internal_confirmed_meeting_attendees.up,
    down: migration_20260604_120000_add_internal_confirmed_meeting_attendees.down,
    name: '20260604_120000_add_internal_confirmed_meeting_attendees'
  },
  {
    up: migration_20260702_120000_add_meeting_attendee_response.up,
    down: migration_20260702_120000_add_meeting_attendee_response.down,
    name: '20260702_120000_add_meeting_attendee_response'
  },
  {
    up: migration_20260703_120000_add_meeting_attendee_delivery_status.up,
    down: migration_20260703_120000_add_meeting_attendee_delivery_status.down,
    name: '20260703_120000_add_meeting_attendee_delivery_status'
  },
  {
    up: migration_20260704_120000_add_monthly_keyword_watch_fields.up,
    down: migration_20260704_120000_add_monthly_keyword_watch_fields.down,
    name: '20260704_120000_add_monthly_keyword_watch_fields'
  },
  {
    up: migration_20260705_120000_add_monthly_keyword_review_comment_fields.up,
    down: migration_20260705_120000_add_monthly_keyword_review_comment_fields.down,
    name: '20260705_120000_add_monthly_keyword_review_comment_fields'
  },
  {
    up: migration_20260706_120000_add_low_relevancy_exclusion_bucket.up,
    down: migration_20260706_120000_add_low_relevancy_exclusion_bucket.down,
    name: '20260706_120000_add_low_relevancy_exclusion_bucket'
  },
  {
    up: migration_20260706_120000_add_monthly_keyword_row_index.up,
    down: migration_20260706_120000_add_monthly_keyword_row_index.down,
    name: '20260706_120000_add_monthly_keyword_row_index'
  },
  {
    up: migration_20260707_120000_add_monthly_keyword_removed_fields.up,
    down: migration_20260707_120000_add_monthly_keyword_removed_fields.down,
    name: '20260707_120000_add_monthly_keyword_removed_fields'
  },
  {
    up: migration_20260708_120000_add_monthly_keyword_review_dismissed_fields.up,
    down: migration_20260708_120000_add_monthly_keyword_review_dismissed_fields.down,
    name: '20260708_120000_add_monthly_keyword_review_dismissed_fields'
  },
  {
    up: migration_20260709_120000_add_monthly_keyword_outcome_fields.up,
    down: migration_20260709_120000_add_monthly_keyword_outcome_fields.down,
    name: '20260709_120000_add_monthly_keyword_outcome_fields'
  },
  {
    up: migration_20260710_120000_add_client_pulse_analytics_metrics.up,
    down: migration_20260710_120000_add_client_pulse_analytics_metrics.down,
    name: '20260710_120000_add_client_pulse_analytics_metrics'
  },
  {
    up: migration_20260711_120000_add_client_pulse_history.up,
    down: migration_20260711_120000_add_client_pulse_history.down,
    name: '20260711_120000_add_client_pulse_history'
  },
  {
    up: migration_20260711_130000_fix_mtvc_assigned_list_relationship_column.up,
    down: migration_20260711_130000_fix_mtvc_assigned_list_relationship_column.down,
    name: '20260711_130000_fix_mtvc_assigned_list_relationship_column'
  },
  {
    up: migration_20260711_140000_null_empty_mtvc_recommended_match_type.up,
    down: migration_20260711_140000_null_empty_mtvc_recommended_match_type.down,
    name: '20260711_140000_null_empty_mtvc_recommended_match_type'
  },
  {
    up: migration_20260712_120000_add_mtvc_added_as_keyword_fields.up,
    down: migration_20260712_120000_add_mtvc_added_as_keyword_fields.down,
    name: '20260712_120000_add_mtvc_added_as_keyword_fields'
  },
  {
    up: migration_20260713_120000_add_optimate_starter_questions.up,
    down: migration_20260713_120000_add_optimate_starter_questions.down,
    name: '20260713_120000_add_optimate_starter_questions'
  },
  {
    up: migration_20260714_120000_add_optimate_voice_realtime_model.up,
    down: migration_20260714_120000_add_optimate_voice_realtime_model.down,
    name: '20260714_120000_add_optimate_voice_realtime_model'
  },
  {
    up: migration_20260721_120000_add_optimate_email_assistant_model.up,
    down: migration_20260721_120000_add_optimate_email_assistant_model.down,
    name: '20260721_120000_add_optimate_email_assistant_model'
  },
  {
    up: migration_20260715_120000_add_agent_soul_applies_to.up,
    down: migration_20260715_120000_add_agent_soul_applies_to.down,
    name: '20260715_120000_add_agent_soul_applies_to'
  },
  {
    up: migration_20260716_120000_add_realtime_voice_usage.up,
    down: migration_20260716_120000_add_realtime_voice_usage.down,
    name: '20260716_120000_add_realtime_voice_usage'
  },
  {
    up: migration_20260717_120000_add_notification_hot_path_indexes.up,
    down: migration_20260717_120000_add_notification_hot_path_indexes.down,
    name: '20260717_120000_add_notification_hot_path_indexes'
  },
  {
    up: migration_20260718_120000_add_team_tasks.up,
    down: migration_20260718_120000_add_team_tasks.down,
    name: '20260718_120000_add_team_tasks'
  },
  {
    up: migration_20260719_120000_add_team_task_comments.up,
    down: migration_20260719_120000_add_team_task_comments.down,
    name: '20260719_120000_add_team_task_comments'
  },
  {
    up: migration_20260720_120000_add_negative_keyword_campaign_count.up,
    down: migration_20260720_120000_add_negative_keyword_campaign_count.down,
    name: '20260720_120000_add_negative_keyword_campaign_count'
  },
  {
    up: migration_20260720_130000_refresh_negative_keyword_campaign_counts.up,
    down: migration_20260720_130000_refresh_negative_keyword_campaign_counts.down,
    name: '20260720_130000_refresh_negative_keyword_campaign_counts'
  },
  {
    up: migration_20260722_120000_add_missing_client_business_fields.up,
    down: migration_20260722_120000_add_missing_client_business_fields.down,
    name: '20260722_120000_add_missing_client_business_fields'
  },
  {
    up: migration_20260723_120000_add_soul_rows_from_tone_md.up,
    down: migration_20260723_120000_add_soul_rows_from_tone_md.down,
    name: '20260723_120000_add_soul_rows_from_tone_md'
  },
  {
    up: migration_20260724_120000_add_monthly_keyword_selection_rows.up,
    down: migration_20260724_120000_add_monthly_keyword_selection_rows.down,
    name: '20260724_120000_add_monthly_keyword_selection_rows'
  },
  {
    up: migration_20260725_120000_add_match_type_synonym_rules.up,
    down: migration_20260725_120000_add_match_type_synonym_rules.down,
    name: '20260725_120000_add_match_type_synonym_rules'
  },
  {
    up: migration_20260726_120000_add_match_type_allow_list_terms.up,
    down: migration_20260726_120000_add_match_type_allow_list_terms.down,
    name: '20260726_120000_add_match_type_allow_list_terms'
  },
  {
    up: migration_20260727_120000_add_client_overview.up,
    down: migration_20260727_120000_add_client_overview.down,
    name: '20260727_120000_add_client_overview'
  },
  {
    up: migration_20260728_120000_add_client_wishlist_items.up,
    down: migration_20260728_120000_add_client_wishlist_items.down,
    name: '20260728_120000_add_client_wishlist_items'
  },
  {
    up: migration_20260728_130000_expand_client_wishlist_items.up,
    down: migration_20260728_130000_expand_client_wishlist_items.down,
    name: '20260728_130000_expand_client_wishlist_items'
  },
  {
    up: migration_20260729_120000_add_client_proposal_keyword_research_jobs.up,
    down: migration_20260729_120000_add_client_proposal_keyword_research_jobs.down,
    name: '20260729_120000_add_client_proposal_keyword_research_jobs'
  },
];
