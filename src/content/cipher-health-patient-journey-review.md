# Dispensary / cannabis service

## Current website positioning

- Label: `Dispensary`.
- Eyebrow: `Medical cannabis dispensary`.
- Hero blurb: “A focused interview captures what the care team needs for triage, booking, and safe follow-up.”
- Service page says prescribing decisions are made independently by an AHPRA-registered prescriber in accordance with Australian law.
- Treatment reasons shown: mental health issues, sleep disorders, pain management, digestive issues.

## Current pricing shown

| Item | Price | Duration | Script length | Current location |
| --- | ---: | --- | --- | --- |
| Doctor consult / initial consult | `$99` | `45 mins` |  | `/dispensary` and `/dispensary/consult` |
| Follow-up consult | `$79` | `30 mins` |  | `/dispensary` and `/dispensary/consult` |
| Re-script | `$39` in shared catalog, but not publicly bookable for dispensary | `15 mins` |  | Redirects to login |

## Competitor pricing — cannabis / dispensary

| Competitor | Comparable pricing | Model / partner review note |
| --- | --- | --- |
| Alternaleaf | Nurse consult: `FREE`; doctor consult: `$29`; concession card holders get 15% off initial + follow-up consults. | Closest direct cannabis competitor; undercuts consult pricing and relies on dispensing margin. |
| Astrid Health |  | Direct cannabis/dispensary competitor; pricing is not publicly published and needs phone confirmation. |
| Folium Health | Free 15-minute consultation; no published per-consult fee. | Dispensary-led model; revenue appears to come from product, dispensing, and wellness services. |
| Updoc |  | Cannabis exists in the broader offer, but exact cannabis consult pricing was not captured; relevant telehealth benchmark, less direct than cannabis-specialist clinics. |
| AU cannabis market context | Initial consults typically `$99–$250`; follow-ups typically `$49–$120`; budget clinics around `$99 initial / $59–$79 follow-up`. | Cipher’s `$99 initial / $79 follow-up` sits at the budget-to-mid market point, but above Alternaleaf’s aggressive funnel. |

## Competitor questionnaire differences — collapsible

| Area | Cipher current form | Competitor pattern | Partner decision needed |
| --- | --- | --- | --- |
| Early eligibility | DOB appears after name, email, and phone; under 18 exits. | Alternaleaf starts with age, state, previous conventional treatment, condition, duration, cannabis history, pregnancy, and psychosis/schizophrenia screens. | Decide whether cannabis eligibility should be front-loaded before contact capture or remain after lead capture. |
| State/location | Cipher dispensary form does not currently ask state/territory in the short dispensary flow. | Alternaleaf and Astrid ask state/territory early. | Add state/territory if prescribing/pharmacy eligibility requires it. |
| Conventional treatment history | Cipher asks goals/history broadly. | Alternaleaf explicitly asks whether conventional treatments have been tried and how long the condition has existed. | Confirm if this is clinically required before booking. |
| Mental health exclusion | Cipher asks broad health history but not explicit personal/family psychosis/schizophrenia/bipolar history. | Alternaleaf and Astrid include psychosis/schizophrenia screens. | Add explicit cannabis mental-health exclusion questions if required. |
| GP continuity | Cipher does not ask regular GP details or consent to share in the dispensary flow. | Astrid asks GP details and consent to share. | Confirm whether continuity-of-care consent should be captured. |
| Product preference | Cipher asks product format preference near the end. | Astrid captures oil/flower/capsule/unsure as treatment preference. | Keep free-text or convert to controlled options for pharmacy routing. |

## Full dispensary patient/admin/doctor journey

This is the end-to-end journey from service selection through consult, prescribing/pharmacy handoff, delivery, and follow-up/re-script prompts. Partners can add, remove, or reorder steps in the table.

| Step | Patient-facing action | Admin / doctor action |
| ---: | --- | --- |
| Step 1 | Patient starts dispensary consult and chooses initial consult or follow-up. | Website stores selected service pathway. |
| Step 2 | Patient enters name, email, and phone. | System creates a `NEW_LEAD` after phone so staff can recover abandoned forms. |
| Step 3 | Patient completes DOB and eligibility checks. | If under 18, pregnant/trying/unsure, or no Medicare/IHI on initial consult, system marks lead `NOT_ELIGIBLE`. |
| Step 4 | Patient completes clinical, medication, health history, dispensary-specific, preference, consent, and privacy questions. | System creates or completes intake as `NEW` and stores answers for triage. |
| Step 5 | Patient receives payment requirement / payment link for consult. | System creates pending payment for initial or follow-up consult. |
| Step 6 | After payment is paid, patient can book a consult slot. | Admin can match/create patient, assign practitioner, and schedule appointment; system requires payment before booking if a time is selected. |
| Step 7 | Patient receives booking confirmation and reminders. | System queues appointment confirmation, operational reminders, audit events, and calendar sync. |
| Step 8 | Doctor/NP reviews intake before/during consult and calls patient by phone/video. | Doctor documents clinical decision and next actions in patient record. |
| Step 9 | If clinically appropriate, doctor creates script. | Current operational note from project context: currently through MediRecords; future in-house prescribing/eRx integration planned. |
| Step 10 | Patient receives confirmation / SMS / email as configured. | Staff/pharmacy coordination occurs outside the public form. |
| Step 11 | Patient receives a notification that the partner pharmacy has confirmed prescribed product availability and is requesting payment through the Cipher patient portal. Patient confirms or provides a delivery address that matches their patient details. | Cipher facilitates the handoff only. The partner pharmacy receives prescription/order details, logs into the Cipher admin site as the pharmacy, confirms products are in stock, and triggers the patient payment/address notification. Clinic and pharmacy responsibilities remain separate in the same platform. |
| Step 12 | Patient pays the pharmacy-requested amount through the Cipher portal. | Payment is requested by the partner pharmacy and processed through the portal so funds go directly to the pharmacy, not the clinic. Cipher records payment status and audit trail while preserving the pharmacy/clinic separation. |
| Step 13 | Patient receives product/delivery tracking where available. | After payment, the partner pharmacy dispenses the product, uses the confirmed delivery address, then returns to Cipher and marks the order as complete. Cipher facilitates visibility and status tracking; the pharmacy remains responsible for dispensing and fulfilment. |
| Step 14 | Patient receives a completion email thanking them and reminding them they can use the patient portal to view prescriptions, see prescription duration, and request prescription refills. | Refill requests are initiated through the Cipher portal and routed to the partner pharmacy while keeping pharmacy and clinic responsibilities separate within the same platform. |

## Dispensary form questions — current order

| Step | Category | Question | Type / options | Required | Conditional logic |
| ---: | --- | --- | --- | --- | --- |
| 0 | Booking type | Is this an initial consult or a follow-up? | Choice: `Initial consultation · $99`; `Follow-up · $79` | Yes | Re-scripts are not shown; helper says re-scripts are available from the patient portal. |
| 1 | About you | What is your full name? | Text | Yes | Always. |
| 2 | Contact | What email should we use? | Email | Yes | Always. |
| 3 | Contact | What phone number can the team call or SMS? | Phone | Yes | Always. Early lead is captured after this step. |
| 4 | About you | What is your date of birth? | Date | Yes | Always. Under 18 exits as not eligible. |
| 5 | Medicare | Do you have a Medicare card? | Choice: Yes / No | Yes | Initial consult only. |
| 6 | Medicare | What is your Medicare card number? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 7 | Medicare | What is your Individual Reference Number (IRN)? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 8 | Healthcare identifier | Do you have an IHI (Individual Healthcare Identifier) number? | Choice: Yes / No | Yes | Initial consult only; only if Medicare = No. No exits as not eligible. |
| 9 | Healthcare identifier | What is your IHI number? | Text | Yes | Initial consult only; only if Medicare = No and IHI = Yes. |
| 10 | Clinical goals | What goals, symptoms, or support are you looking for? | Textarea | Yes | Always. |
| 11 | Medication safety | What medicines or supplements do you currently take? | Textarea | No | Always. |
| 12 | Medication safety | Do you have any allergies or previous reactions? | Textarea | No | Always. |
| 13 | Health history | What relevant health history should the practitioner know? | Textarea | No | Always. |
| 14 | Safety check | Are you pregnant, breastfeeding, or trying to conceive? | Choice: Not applicable / No / Yes / Unsure | Yes | Yes or Unsure exits as not eligible. |
| 15 | Recent care | Any prescription, documentation, or recent care details? | Textarea | No | Always. |
| 16 | Urgent symptoms | Do you have urgent or red-flag symptoms? | Checkbox | No | Always. |
| 17 | Dispensary | Which conditions are you seeking support for? | Textarea | Yes | Always. Helper examples: chronic pain, sleep, anxiety, or another condition. |
| 18 | Dispensary | Have you used prescribed medical cannabis before? | Choice: No, this would be new / Yes, currently prescribed / Yes, in the past | Yes | Always. |
| 19 | Dispensary | Any product format preference? | Textarea | No | Always. Placeholder examples: oil, flower, capsules, no preference. |
| 20 | Contact preference | What contact or delivery details should we know? | Textarea | No | Always. |
| 21 | Extra notes | Anything else the care team should know? | Textarea | No | Always. |
| 22 | Consent | Do you consent to Cipher Health contacting you? | Checkbox | Yes | Always. |
| 23 | Privacy | Do you accept the privacy notice and submit this intake? | Checkbox | Yes | Always. |

For follow-up consults, steps 5–9 are skipped because Medicare/IHI questions are currently initial-consult only.

---

# Peptides service


## Current pricing shown

| Peptide entry point | Current price display | Duration / timing | Script length | Notes |
| --- | ---: | --- | --- | --- |
| Generic initial consult | `$99` | `45 mins` |  | Shared consult catalog. |
| Generic follow-up | `$79` | `30 mins` |  | Shared consult catalog. |
| Generic re-script | `$39` | `15 mins` |  | Shared consult catalog. |
| Detailed peptide/optimisation initial consult | `$79` | `25 min` practitioner review |  | Page also states `24–48h` results review window. Backend payment defaults should be checked against this display. |

## Competitor pricing — peptides / optimisation

| Competitor | Comparable pricing | Model / partner review note |
| --- | --- | --- |
| Folium Health | Free 15-minute consultation; peptide therapy price not published and appears quote/protocol-based. | Closest peptide-adjacent local benchmark; low-friction consult with product/protocol revenue. |
| BioRegeneration / Hydralyfe |  | Integrative health review model; pricing could not be verified because the portal was blocked during capture. |
| Hims |  | US-only/geoblocked; exclude from AU partner pricing decisions. |
| Market context |  | Peptide pricing is opaque across captured competitors; Cipher should choose whether transparent `$79`/`$99` consult pricing is a trust advantage. |

## Competitor questionnaire differences — collapsible

| Area | Cipher current form | Competitor pattern | Partner decision needed |
| --- | --- | --- | --- |
| Intake depth | Cipher now starts with a short setup form (contact, Medicare/IHI, address, goals, brief medicines/allergies, hard-stop safety, privacy, payment) and moves the detailed clinical questionnaire until after bloods are received. | BioRegeneration uses a single long-scroll ~90-field integrative review across peptides, HRT, cannabis, and weight. | Keep Cipher multi-step and conditional to avoid BioRegen-style drop-off. |
| Lead friction | Cipher captures minimum setup before payment, then detailed clinical depth after bloods and before booking. | Folium uses a short lead form then a free 15-minute consult before deeper intake. | Decide whether peptides should prioritise conversion speed or pre-consult clinical completeness. |
| ID and Medicare | Cipher captures Medicare/IHI and optional photo ID fields. | BioRegeneration collects Medicare and photo ID upfront. | Medicare/IHI stays upfront; photo ID and delivery details belong in the post-bloods questionnaire unless operations require them earlier. |
| Contraindications | Cipher includes broad medication, history, safety flag, vitals, ECG, and contraindication screens. | BioRegeneration includes injectable-specific contraindications and blanket off-label/unapproved consent. | Confirm final contraindication list and whether consent should be per medicine class. |
| Consent structure | Cipher has telehealth, collection/delivery, peptide suitability, off-label/unapproved, payment, contact, privacy, and accuracy confirmations. | BioRegeneration uses a broad delivery/informed consent plus final signature. | Keep layered consents if partners want stronger audit trail. |

## Generic peptide consult form questions — current order

Generic peptide uses the shared consult form below. If the patient lands without a pathway query, step 0 appears first; otherwise the selected pathway starts at step 1.

| Step | Category | Question | Type / options | Required | Conditional logic |
| ---: | --- | --- | --- | --- | --- |
| 0 | Booking type | Which consult type do you need? | Choice: Initial consultation `$99`; Follow-up `$79`; Re-script `$39` | Yes | Only if no pathway query is provided. |
| 1 | About you | What is your full name? | Text | Yes | Always. |
| 2 | Contact | What email should we use? | Email | Yes | Always. |
| 3 | Contact | What phone number can the team call or SMS? | Phone | Yes | Always; creates early lead after phone. |
| 4 | About you | What is your date of birth? | Date | Yes | Under 18 exits as not eligible. |
| 5 | Medicare | Do you have a Medicare card? | Choice: Yes / No | Yes | Initial consult only. |
| 6 | Medicare | What is your Medicare card number? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 7 | Medicare | What is your Individual Reference Number (IRN)? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 8 | Healthcare identifier | Do you have an IHI (Individual Healthcare Identifier) number? | Choice: Yes / No | Yes | Initial consult only; only if Medicare = No; No exits as not eligible. |
| 9 | Healthcare identifier | What is your IHI number? | Text | Yes | Initial consult only; only if Medicare = No and IHI = Yes. |
| 10 | Clinical goals | What goals, symptoms, or support are you looking for? | Textarea | Yes | Always. |
| 11 | Medication safety | What medicines or supplements do you currently take? | Textarea | No | Always. |
| 12 | Medication safety | Do you have any allergies or previous reactions? | Textarea | No | Always. |
| 13 | Health history | What relevant health history should the practitioner know? | Textarea | No | Always. |
| 14 | Safety check | Are you pregnant, breastfeeding, or trying to conceive? | Choice: Not applicable / No / Yes / Unsure | Yes | Yes or Unsure exits as not eligible. |
| 15 | Recent care | Any prescription, documentation, or recent care details? | Textarea | No | Always. |
| 16 | Urgent symptoms | Do you have urgent or red-flag symptoms? | Checkbox | No | Always; does not stop submission. |
| 17 | Peptides | What are your main goals with peptide therapy? | Textarea | Yes | Always. |
| 18 | Peptides | Do you have recent blood test results? | Choice: Yes within last 6 months / Yes but older than 6 months / No recent bloods | Yes | Always. |
| 19 | Peptides | Have you used peptides before? | Textarea | No | Always. |
| 20 | Contact preference | What contact or delivery details should we know? | Textarea | No | Always. |
| 21 | Extra notes | Anything else the care team should know? | Textarea | No | Always. |
| 22 | Consent | Do you consent to Cipher Health contacting you? | Checkbox | Yes | Always. |
| 23 | Privacy | Do you accept the privacy notice and submit this intake? | Checkbox | Yes | Always. |

## Peptide journey

| Step | Patient-facing action | Admin / doctor action |
| ---: | --- | --- |
| Step 1 | Patient completes short peptide setup form online. | System creates early lead after phone and stores basic intake as `NEW`. |
| Step 2 | Patient completes Medicare/IHI, address, goals, brief medicines/allergies, hard-stop safety, privacy, and payment acknowledgement. | System exits and creates follow-up task if underage, pregnancy/unsure, or no Medicare/IHI; otherwise creates pending consultation payment. |
| Step 3 | Patient pays upfront. | Payment moves peptide stage from `AWAITING_PAYMENT` to `AWAITING_BLOODS` and sends iMed bloods/resting ECG instructions. |
| Step 4 | Patient completes iMed pathology and resting ECG externally. | Care team records bloods summary/file and moves stage to `BLOODS_RECEIVED`. |
| Step 5 | Patient completes detailed pre-consult questionnaire. | System saves a linked `FormRecord`; booking remains blocked until this is complete. |
| Step 6 | Patient books/attends peptide practitioner consult. | Admin creates/matches patient, schedules practitioner, queues confirmation/reminders/calendar sync. |
| Step 7 | Doctor/NP reviews basic intake, bloods, ECG, detailed questionnaire, contraindications, and suitability. | Doctor documents clinical decision and protocol if appropriate. |
| Step 8 | If clinically appropriate, doctor creates script/order. | Current partner-supplied screenshot implies doctor creates script/data, then Purple/compound pharmacy flow; exact implementation needs confirmation. |
| Step 9 | Patient receives confirmation and delivery/payment instructions. | Pharmacy/dispensary coordinates quote/payment, compounding, courier, tracking, and repeat/follow-up triggers. |
| Step 10 | Patient receives product and support. | Admin monitors protocol consult, 4-week support touchpoints, retention, and follow-up/re-script needs. |


## Peptide/optimisation staged form questions — current order

### Phase 1 — short setup before payment and bloods

| Step | Category | Question | Type / options | Required | Conditional logic |
| ---: | --- | --- | --- | --- | --- |
| 1 | About you | What is your full name? | Text | Yes | Always. |
| 2 | Contact | What email should we use? | Email | Yes | Always. |
| 3 | Contact | What phone number can the team call or SMS? | Phone | Yes | Early lead is captured after this step. |
| 4 | About you | What is your date of birth? | Date | Yes | Under 18 exits as not eligible. |
| 5 | Medicare/IHI | Medicare card, IRN, or IHI details. | Choice/text | Yes | IHI only if no Medicare; no ID exits as not eligible. |
| 6 | Address | Street/suburb/state/postcode. | Text/choice | Yes | Used for pathology/pharmacy routing. |
| 7 | Goals | What is your main reason for a peptide consultation? | Textarea | Yes | Always. |
| 8 | Medication safety | Known allergies and current medicines/supplements. | Choice/textarea | No | Brief first-pass safety context. |
| 9 | Safety check | Pregnancy/breastfeeding/trying and high-level safety flags. | Choice/multi-select | Yes | Pregnancy/unsure exits as not eligible. |
| 10 | Urgent symptoms | Do you have urgent or red-flag symptoms? | Checkbox | No | Always; does not stop submission. |
| 11 | Consent/payment | Contact consent, privacy acceptance, and upfront payment acknowledgement. | Checkbox | Yes | Creates intake and payment. |

### Phase 3 — detailed questionnaire after bloods are received

| Area | Questions moved to post-bloods questionnaire |
| --- | --- |
| Health profile | Overall health, height, weight, waist, occupation, gender identity, ethnicity, how they heard about Cipher. |
| Treatment context | Treatment priorities, prior peptides, HRT/anabolic steroid use, functional impact, treatment history. |
| Medication/history | Medication categories, other supplements, medical conditions, surgery, GP/check-up/specialist context. |
| Lifestyle/vitals | Mood, diet, nutrition, foods avoided, smoking, lifestyle risks, fitness, activity, blood pressure, resting heart rate. |
| Comprehensive safety | Family/past history flags, contraindication screen, current/past condition details, joint problems, injuries or pain. |
| Results/preferences | Pathology status, ECG status, result notes, treatment format preference, photo ID, delivery preference/address. |
| Final consents | Collection/delivery coordination, telehealth, peptide suitability, off-label/unapproved acknowledgement, final accuracy confirmation. |

---

# Weight loss service

## Current website positioning

- Label: `Weight loss`.
- Eyebrow: `Weight management`.
- Hero blurb: “Share your weight goals and history so the practitioner can assess a suitable, safe program.”

## Current pricing shown

| Pathway | Price | Duration | Script length |
| --- | ---: | --- | --- |
| Initial consultation | `$99` | `45 mins` |  |
| Follow-up | `$79` | `30 mins` |  |
| Re-script | `$39` | `15 mins` |  |

## Competitor pricing — weight loss

| Competitor | Comparable pricing | Model / partner review note |
| --- | --- | --- |
| Updoc | Weight loss consult from `$99.95`; Platinum subscription `$79.95/mo` includes weight loss. | Strong benchmark for subscription/maintenance care. |
| InstantScripts | Weight management `$89`; doctor consult `$49`; prescriptions from `$19`. | Large generalist benchmark; cheaper than Cipher initial consult but not specialist positioning. |
| Hims |  | US-only/geoblocked; exclude from AU pricing decisions. |

## Competitor questionnaire differences — collapsible

| Area | Cipher current form | Competitor pattern | Partner decision needed |
| --- | --- | --- | --- |
| Weight metrics | Cipher asks weight goals and current height/weight. | Updoc/InstantScripts captured structure suggests BMI/weight metrics behind app flow; BioRegeneration captures height, weight, waist, vitals, goals, and broad medical history. | Add BMI, waist, vitals, and target/timeline fields if prescribing risk assessment needs them before consult. |
| GLP-1 safety | Cipher generic form does not explicitly ask diabetes, pancreatitis, gallbladder, thyroid tumour, eating disorder, or pathology questions. | BioRegeneration captures pancreas, gallbladder, thyroid, diabetes, suicidal thoughts/severe mood, GI, heart, kidney, liver, and more. | Confirm the minimum GLP-1 contraindication set. |
| Subscription model | Cipher is per-consult: `$99`, `$79`, `$39`. | Updoc offers `$79.95/mo` Platinum for weight loss plus other services. | Decide whether Cipher needs a maintenance membership or stay consult-only. |

## Weight loss form questions — current order

Weight loss uses the shared consult form below. If the patient lands without a pathway query, step 0 appears first; otherwise the selected pathway starts at step 1.

| Step | Category | Question | Type / options | Required | Conditional logic |
| ---: | --- | --- | --- | --- | --- |
| 0 | Booking type | Which consult type do you need? | Choice: Initial consultation `$99`; Follow-up `$79`; Re-script `$39` | Yes | Only if no pathway query is provided. |
| 1 | About you | What is your full name? | Text | Yes | Always. |
| 2 | Contact | What email should we use? | Email | Yes | Always. |
| 3 | Contact | What phone number can the team call or SMS? | Phone | Yes | Always; creates early lead after phone. |
| 4 | About you | What is your date of birth? | Date | Yes | Under 18 exits as not eligible. |
| 5 | Medicare | Do you have a Medicare card? | Choice: Yes / No | Yes | Initial consult only. |
| 6 | Medicare | What is your Medicare card number? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 7 | Medicare | What is your Individual Reference Number (IRN)? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 8 | Healthcare identifier | Do you have an IHI (Individual Healthcare Identifier) number? | Choice: Yes / No | Yes | Initial consult only; only if Medicare = No; No exits as not eligible. |
| 9 | Healthcare identifier | What is your IHI number? | Text | Yes | Initial consult only; only if Medicare = No and IHI = Yes. |
| 10 | Clinical goals | What goals, symptoms, or support are you looking for? | Textarea | Yes | Always. |
| 11 | Medication safety | What medicines or supplements do you currently take? | Textarea | No | Always. |
| 12 | Medication safety | Do you have any allergies or previous reactions? | Textarea | No | Always. |
| 13 | Health history | What relevant health history should the practitioner know? | Textarea | No | Always. |
| 14 | Safety check | Are you pregnant, breastfeeding, or trying to conceive? | Choice: Not applicable / No / Yes / Unsure | Yes | Yes or Unsure exits as not eligible. |
| 15 | Recent care | Any prescription, documentation, or recent care details? | Textarea | No | Always. |
| 16 | Urgent symptoms | Do you have urgent or red-flag symptoms? | Checkbox | No | Always; does not stop submission. |
| 17 | Weight loss | What are your weight goals? | Textarea | Yes | Always; helper asks for current weight, target, and timeframe if available. |
| 18 | Weight loss | What is your current height and weight? | Text | Yes | Always. |
| 19 | Weight loss | Have you tried weight-loss medication or programs before? | Textarea | No | Always. |
| 20 | Contact preference | What contact or delivery details should we know? | Textarea | No | Always. |
| 21 | Extra notes | Anything else the care team should know? | Textarea | No | Always. |
| 22 | Consent | Do you consent to Cipher Health contacting you? | Checkbox | Yes | Always. |
| 23 | Privacy | Do you accept the privacy notice and submit this intake? | Checkbox | Yes | Always. |

## Weight loss journey

| Step | Patient-facing action | Admin / doctor action |
| ---: | --- | --- |
| Step 1 | Patient chooses initial, follow-up, or re-script pathway. | System maps pathway to service code and pricing. |
| Step 2 | Patient enters contact details. | System creates early `NEW_LEAD`. |
| Step 3 | Patient completes DOB and, for initial consult, Medicare/IHI. | System exits as not eligible for underage or missing Medicare/IHI on initial consult. |
| Step 4 | Patient completes clinical, medication, health history, pregnancy, urgent symptom, and weight-loss questions. | System stores clinical answers for triage. |
| Step 5 | Patient accepts contact/privacy and submits. | System creates intake as `NEW` and creates payment link. |
| Step 6 | Patient pays and books available consult slot. | Admin creates/matches patient and schedules practitioner after payment. |
| Step 7 | Patient receives confirmation and reminders. | System queues appointment confirmation, operational reminders, audit, and calendar sync. |
| Step 8 | Doctor/NP reviews weight history, medications, contraindications, and goals. | Doctor documents plan; prescribing only where clinically appropriate. |
| Step 9 | Patient receives plan, script/order/payment/delivery instructions if relevant. | Admin handles follow-up tasks, payment links, prescription release boundaries, and re-script/follow-up reminders. |

Partner gap: current form does not include detailed BMI, GLP-1 contraindication, diabetes, pancreatitis, gallbladder, thyroid tumour, eating disorder, pathology, or vitals workflows unless supplied elsewhere by staff during consult.

---

# Men’s performance service

## Current website positioning

- Label: `Men's performance`.
- Eyebrow: `Men's performance`.
- Hero blurb: “A discreet interview captures what the practitioner needs to assess suitable performance support.”

## Current pricing shown

| Pathway | Price | Duration | Script length |
| --- | ---: | --- | --- |
| Initial consultation | `$99` | `45 mins` |  |
| Follow-up | `$79` | `30 mins` |  |
| Re-script | `$39` | `15 mins` |  |

## Competitor pricing — men’s performance / general telehealth benchmark

| Competitor | Comparable pricing | Model / partner review note |
| --- | --- | --- |
| Hola Health | Short consult `$39`; long consult `$49`; online script `$18.90`. | General telehealth benchmark, not men’s-performance-specific in captured data. |
| InstantScripts | Doctor consult `$49`; prescriptions from `$19`. | Generalist price anchor for simple script/consult journeys. |
| Direct men’s-performance competitors |  | Not captured in supplied pricing file; partners should add preferred ED/men’s health benchmarks if needed. |

## Men’s performance form questions — current order

Men’s performance uses the shared consult form below. If the patient lands without a pathway query, step 0 appears first; otherwise the selected pathway starts at step 1.

| Step | Category | Question | Type / options | Required | Conditional logic |
| ---: | --- | --- | --- | --- | --- |
| 0 | Booking type | Which consult type do you need? | Choice: Initial consultation `$99`; Follow-up `$79`; Re-script `$39` | Yes | Only if no pathway query is provided. |
| 1 | About you | What is your full name? | Text | Yes | Always. |
| 2 | Contact | What email should we use? | Email | Yes | Always. |
| 3 | Contact | What phone number can the team call or SMS? | Phone | Yes | Always; creates early lead after phone. |
| 4 | About you | What is your date of birth? | Date | Yes | Under 18 exits as not eligible. |
| 5 | Medicare | Do you have a Medicare card? | Choice: Yes / No | Yes | Initial consult only. |
| 6 | Medicare | What is your Medicare card number? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 7 | Medicare | What is your Individual Reference Number (IRN)? | Text | Yes | Initial consult only; only if Medicare = Yes. |
| 8 | Healthcare identifier | Do you have an IHI (Individual Healthcare Identifier) number? | Choice: Yes / No | Yes | Initial consult only; only if Medicare = No; No exits as not eligible. |
| 9 | Healthcare identifier | What is your IHI number? | Text | Yes | Initial consult only; only if Medicare = No and IHI = Yes. |
| 10 | Clinical goals | What goals, symptoms, or support are you looking for? | Textarea | Yes | Always. |
| 11 | Medication safety | What medicines or supplements do you currently take? | Textarea | No | Always. |
| 12 | Medication safety | Do you have any allergies or previous reactions? | Textarea | No | Always. |
| 13 | Health history | What relevant health history should the practitioner know? | Textarea | No | Always. |
| 14 | Safety check | Are you pregnant, breastfeeding, or trying to conceive? | Choice: Not applicable / No / Yes / Unsure | Yes | Yes or Unsure exits as not eligible. |
| 15 | Recent care | Any prescription, documentation, or recent care details? | Textarea | No | Always. |
| 16 | Urgent symptoms | Do you have urgent or red-flag symptoms? | Checkbox | No | Always; does not stop submission. |
| 17 | Men’s performance | What performance concern would you like support with? | Textarea | Yes | Always; helper examples: erectile function, libido, energy, stamina. |
| 18 | Men’s performance | How long has this been a concern? | Choice: Recent within a few weeks / A few months / Long term six months or more | Yes | Always. |
| 19 | Men’s performance | Any heart, blood pressure, or circulation history? | Textarea | No | Always. |
| 20 | Contact preference | What contact or delivery details should we know? | Textarea | No | Always. |
| 21 | Extra notes | Anything else the care team should know? | Textarea | No | Always. |
| 22 | Consent | Do you consent to Cipher Health contacting you? | Checkbox | Yes | Always. |
| 23 | Privacy | Do you accept the privacy notice and submit this intake? | Checkbox | Yes | Always. |

## Men’s performance journey

| Step | Patient-facing action | Admin / doctor action |
| ---: | --- | --- |
| Step 1 | Patient chooses initial, follow-up, or re-script pathway. | System maps pathway to service code and pricing. |
| Step 2 | Patient enters contact details. | System creates early `NEW_LEAD`. |
| Step 3 | Patient completes DOB and, for initial consult, Medicare/IHI. | System exits as not eligible for underage or missing Medicare/IHI on initial consult. |
| Step 4 | Patient completes clinical, medication, health history, pregnancy, urgent symptom, and men’s-performance questions. | System stores answers for practitioner review. |
| Step 5 | Patient accepts contact/privacy and submits. | System creates intake as `NEW` and creates payment link. |
| Step 6 | Patient pays and books available consult slot. | Admin creates/matches patient and schedules practitioner after payment. |
| Step 7 | Patient receives confirmation and reminders. | System queues confirmation, operational reminders, audit, and calendar sync. |
| Step 8 | Doctor/NP reviews sexual health concern, medication interactions, cardiovascular history, and suitability. | Doctor documents plan; prescribing only where clinically appropriate. |
| Step 9 | Patient receives plan, script/order/payment/delivery instructions if relevant. | Admin handles follow-up, payment links, prescription release, re-script reminders, and retention. |

Partner gap: current form does not explicitly ask about nitrates, chest pain, cardiac events, blood pressure readings, PDE5 use, testosterone/HRT labs, prostate history, or detailed sexual health screening.

---
