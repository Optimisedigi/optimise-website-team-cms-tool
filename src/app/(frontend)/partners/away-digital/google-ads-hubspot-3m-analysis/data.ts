/**
 * Data for the Away Digital Teams "Google Ads + HubSpot 3-Month Analysis" deck.
 *
 * Extracted from the Growth Tools report
 *   output/away-digital-teams-paid-search-leads-and-clients.html
 * (generated 6 Oct 2026). Regenerate from that report if the source changes.
 * Lead enquiries are personal data - this deck is client-gated.
 */

export type LeadGradeKey = 'strong' | 'lowbiz' | 'mixed' | 'weak' | 'poorlite' | 'neutral'

export type ClientWonRow = {
  readonly label: string
  readonly clients: string
  readonly spend: string
  readonly cadence: string
  readonly names: readonly string[]
}

export type LeadGrade = {
  readonly key: LeadGradeKey
  readonly label: string
  readonly count: string
  readonly desc: string
}

export type LeadInsight = {
  readonly bold: string
  readonly rest: string
}

export type MonthlyRow = {
  readonly label: string
  readonly total: string
  readonly quality: string
  readonly lowbiz: string
  readonly oneoff: string
  readonly wrong: string
  readonly personal: string
  readonly notdetail: string
  readonly spend: string
  readonly costTotal: string
  readonly costQuality: string
  readonly clients: string
  readonly clientRate: string
}

export type Lead = {
  readonly date: string
  readonly name: string
  readonly company: string
  readonly keyword: string
  readonly asked: string
  readonly gradeKey: LeadGradeKey
  readonly grade: string
  readonly meeting: string
  readonly outcome: string
}

export type LeadGroup = {
  readonly label: string
  readonly summary: string
  readonly leads: readonly Lead[]
}

export const CLIENTS_WON: readonly ClientWonRow[] = [
  {
    "label": "Jul 2025 - May 2026",
    "clients": "8 in 11 months",
    "spend": "$59,863",
    "cadence": "42 days",
    "names": [
      "Folktale (enquired 2 Sep)",
      "Ahvana (enquired 6 Oct)",
      "Leschaco (enquired 16 Oct)",
      "KLAIR LIVING (enquired 16 Oct)",
      "213PNM (enquired 16 Dec)",
      "RAD WAREHOUSE LLC (enquired 16 Dec)",
      "Catapult (enquired 13 Jan)",
      "Go2 Delivery (enquired 7 Mar)"
    ]
  },
  {
    "label": "Jun 2026 - 5 Oct 2026",
    "clients": "5 in 4 months",
    "spend": "$24,586",
    "cadence": "25 days",
    "names": [
      "Compliance Plus (enquired 27 Jun)",
      "Powerflex (enquired 15 Jul)",
      "Winho Trading (enquired 6 Aug)",
      "Erinfair Pty Ltd t/a Bunbury Farmers Market (enquired 24 Aug)",
      "Quest St Kilda (enquired 24 Aug)"
    ]
  }
]

export const CLIENTS_WON_BRAND_NOTE = "Brand searches are not counted: 2 more clients (Halcol Energy and CAPTURELAB) searched for Away by name."

export const LEAD_INSIGHTS: readonly LeadInsight[] = [
  {
    "bold": "68 leads wanted a one-off or short-term project, not a team.",
    "rest": "App builds, websites, Shopify fixes, 3D animation, video and game ideas. 30 of them came from just four service pages: app development, 3D animator, e-commerce developer and IT. None became a client."
  },
  {
    "bold": "20 leads were the wrong service or spam",
    "rest": "(2 marked junk/spam in HubSpot), and 6 more gave only a personal email and no message."
  },
  {
    "bold": "All 13 clients asked for ongoing staff.",
    "rest": "Accountants, bookkeepers, payroll, admin, VAs, marketing staff and developers. None came from a one-off or short-term project request."
  },
  {
    "bold": "Clients from paid search:",
    "rest": "Folktale, Ahvana, Leschaco, 213PNM, RAD WAREHOUSE LLC, Catapult, Go2 Delivery, Compliance Plus, Powerflex, Winho Trading, Erinfair Pty Ltd t/a Bunbury Farmers Market, Quest St Kilda, KLAIR LIVING. Each name opens the contact in HubSpot."
  },
  {
    "bold": "27 quality leads never booked a meeting.",
    "rest": "No calls are logged, 12 have a “Follow up” task that was never started, 4 have no owner, and 6 are marked “unresponsive” by sales. They are flagged “Follow up” in the lead list below."
  },
  {
    "bold": "The new hire.awaydigitalteams.com pages (from August 2026) brought 11 leads:",
    "rest": "4 quality, 2 real businesses with little detail, 1 wrong service or spam, 3 personal emails with no message, 1 not enough detail. HubSpot marked 4 of them junk/spam, though 1 was re-rated as a real business. Their structured questions (roles, number of roles, timeline) make good leads easy to spot."
  }
]

export const LEADS_BY_MONTH: readonly MonthlyRow[] = [
  {
    "label": "Jul-25",
    "total": "21",
    "quality": "6",
    "lowbiz": "3",
    "oneoff": "11",
    "wrong": "1",
    "personal": "0",
    "notdetail": "0",
    "spend": "$29,984",
    "costTotal": "$1,428",
    "costQuality": "$4,997",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "Aug-25",
    "total": "24",
    "quality": "4",
    "lowbiz": "11",
    "oneoff": "7",
    "wrong": "2",
    "personal": "0",
    "notdetail": "0",
    "spend": "$34,829",
    "costTotal": "$1,451",
    "costQuality": "$8,707",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "Sep-25",
    "total": "10",
    "quality": "5",
    "lowbiz": "2",
    "oneoff": "2",
    "wrong": "1",
    "personal": "0",
    "notdetail": "0",
    "spend": "$40,664",
    "costTotal": "$4,066",
    "costQuality": "$8,133",
    "clients": "1",
    "clientRate": "1"
  },
  {
    "label": "Oct-25",
    "total": "18",
    "quality": "9",
    "lowbiz": "0",
    "oneoff": "8",
    "wrong": "1",
    "personal": "0",
    "notdetail": "0",
    "spend": "$55,543",
    "costTotal": "$3,086",
    "costQuality": "$6,171",
    "clients": "3",
    "clientRate": "3"
  },
  {
    "label": "Nov-25",
    "total": "21",
    "quality": "9",
    "lowbiz": "3",
    "oneoff": "7",
    "wrong": "2",
    "personal": "0",
    "notdetail": "0",
    "spend": "$57,045",
    "costTotal": "$2,716",
    "costQuality": "$6,338",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "Dec-25",
    "total": "11",
    "quality": "5",
    "lowbiz": "5",
    "oneoff": "0",
    "wrong": "0",
    "personal": "1",
    "notdetail": "0",
    "spend": "$25,529",
    "costTotal": "$2,321",
    "costQuality": "$5,106",
    "clients": "2",
    "clientRate": "2"
  },
  {
    "label": "Jan-26",
    "total": "17",
    "quality": "7",
    "lowbiz": "4",
    "oneoff": "4",
    "wrong": "2",
    "personal": "0",
    "notdetail": "0",
    "spend": "$40,801",
    "costTotal": "$2,400",
    "costQuality": "$5,829",
    "clients": "1",
    "clientRate": "1"
  },
  {
    "label": "Feb-26",
    "total": "24",
    "quality": "7",
    "lowbiz": "4",
    "oneoff": "8",
    "wrong": "4",
    "personal": "0",
    "notdetail": "1",
    "spend": "$59,558",
    "costTotal": "$2,482",
    "costQuality": "$8,508",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "Mar-26",
    "total": "18",
    "quality": "9",
    "lowbiz": "1",
    "oneoff": "5",
    "wrong": "2",
    "personal": "1",
    "notdetail": "0",
    "spend": "$50,667",
    "costTotal": "$2,815",
    "costQuality": "$5,630",
    "clients": "1",
    "clientRate": "1"
  },
  {
    "label": "Apr-26",
    "total": "24",
    "quality": "8",
    "lowbiz": "5",
    "oneoff": "7",
    "wrong": "3",
    "personal": "1",
    "notdetail": "0",
    "spend": "$42,390",
    "costTotal": "$1,766",
    "costQuality": "$5,299",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "May-26",
    "total": "16",
    "quality": "7",
    "lowbiz": "3",
    "oneoff": "5",
    "wrong": "1",
    "personal": "0",
    "notdetail": "0",
    "spend": "$41,890",
    "costTotal": "$2,618",
    "costQuality": "$5,984",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "Jun-26",
    "total": "11",
    "quality": "6",
    "lowbiz": "2",
    "oneoff": "3",
    "wrong": "0",
    "personal": "0",
    "notdetail": "0",
    "spend": "$39,637",
    "costTotal": "$3,603",
    "costQuality": "$6,606",
    "clients": "1",
    "clientRate": "1"
  },
  {
    "label": "Jul-26",
    "total": "6",
    "quality": "5",
    "lowbiz": "1",
    "oneoff": "0",
    "wrong": "0",
    "personal": "0",
    "notdetail": "0",
    "spend": "$28,894",
    "costTotal": "$4,816",
    "costQuality": "$5,779",
    "clients": "1",
    "clientRate": "1"
  },
  {
    "label": "Aug-26",
    "total": "12",
    "quality": "4",
    "lowbiz": "3",
    "oneoff": "1",
    "wrong": "1",
    "personal": "2",
    "notdetail": "1",
    "spend": "$30,516",
    "costTotal": "$2,543",
    "costQuality": "$7,629",
    "clients": "3",
    "clientRate": "3"
  },
  {
    "label": "Sep-26",
    "total": "4",
    "quality": "3",
    "lowbiz": "0",
    "oneoff": "0",
    "wrong": "0",
    "personal": "1",
    "notdetail": "0",
    "spend": "$21,105",
    "costTotal": "$5,276",
    "costQuality": "$7,035",
    "clients": "0",
    "clientRate": "0"
  },
  {
    "label": "Oct-26",
    "total": "1",
    "quality": "1",
    "lowbiz": "0",
    "oneoff": "0",
    "wrong": "0",
    "personal": "0",
    "notdetail": "0",
    "spend": "$2,779",
    "costTotal": "$2,779",
    "costQuality": "$2,779",
    "clients": "0",
    "clientRate": "0"
  }
]

export const LEAD_GROUPS: readonly LeadGroup[] = [
  {
    "label": "July 2025",
    "summary": "21 leads · 6 quality · 14 booked · 0 clients",
    "leads": [
      {
        "date": "2 Jul",
        "name": "shamara jarrett",
        "company": "ServiceCue · -",
        "keyword": "outsource graphic design",
        "asked": "i dont want marketing emailes",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Salesqualifiedlead"
      },
      {
        "date": "4 Jul",
        "name": "Akash Shakya",
        "company": "EB Pearls · Australia",
        "keyword": "digital marketing specialist",
        "asked": "Need assistance with marketing. we like using They ask you answer and brandstory framework. Most of the work involved is building landing pages, testing business idea, adwords and meta campaign launch. And optimisation for SEO and AI bots like chatgpt.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "10 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "7 Jul",
        "name": "Tharshi Hunter",
        "company": "6 Oz. Bakery · Australia",
        "keyword": "outsourcing company",
        "asked": "Hello, I have an online cookie business and i want to increase my orders through my website.",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "9 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "8 Jul",
        "name": "Michelle Falzon",
        "company": "Alchemy of Evolution · Australia",
        "keyword": "outsource mobile app development",
        "asked": "Hello. I am looking for support to assist me with building my app based on my current line of work.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "8 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "9 Jul",
        "name": "Hanna Regan",
        "company": "Superb Civil Group · Australia",
        "keyword": "outsourced bookkeeping firms",
        "asked": "We require remote book keeping for all the services you have listed",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "9 Jul",
        "name": "Melinda W",
        "company": "Nova Bookkeeping · -",
        "keyword": "offshore bookkeeping",
        "asked": "costs",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Plant a seed"
      },
      {
        "date": "10 Jul",
        "name": "Rob Ormond",
        "company": "Social Pinpoint · Australia",
        "keyword": "outsourcing app development",
        "asked": "Hi, We are a SaaS business with a development team based in Australia. We are looking to augment this team with some offshore developers. Looking forward to seeing how you may be able to help. Rob",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "14 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "18 Jul",
        "name": "Jen Tran",
        "company": "Deputy · Australia",
        "keyword": "payroll outsourcing companies",
        "asked": "We are currently exploring offshoring of our finance function, with the aim to hire 1 person initially for Accounts Payable and General Ledger support and potentially more resources in the future. We are a SaaS business based in Sydney, Australia.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "21 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "19 Jul",
        "name": "Matt Ardern",
        "company": "Na · New Zealand",
        "keyword": "overseas app developers",
        "asked": "Hi there. I’m looking to get an app developed on for Apple and android. Can we please arranging a meeting to find out about your company. Cheers Matt",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "21 Jul",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "22 Jul",
        "name": "Bronwyn Griffiths",
        "company": "Bayview Concreting · -",
        "keyword": "offshore bookkeeping",
        "asked": "I would like to know more about your finance department. I am looking for a accounts payable / bookkeeping service",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "31 Jul",
        "outcome": "Plant a seed"
      },
      {
        "date": "28 Jul",
        "name": "Logan Bailey",
        "company": "Allo · Australia",
        "keyword": "outsourcing company",
        "asked": "To Whom it may concern, I’m the founder of *Allo*, a premium cannabis accessories brand based in Australia. We’re preparing to launch our first product - a custom-designed, smell-proof stash box with a secure locking mechanism and clean, modern aesthetic. We’re currently seeking…",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "30 Jul",
        "name": "Mia Uy",
        "company": "Three6 · Australia",
        "keyword": "outsource design services",
        "asked": "We are a consultancy looking to work with a designer than can help create our decks. We work on Powerpoint and we need someone who has the ability to tell a story with the information we place on the pack. It is not a presentation, it is going to be just read by the clinet, so i…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "30 Jul",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "31 Jul",
        "name": "truc Nguyen",
        "company": "TACare Melbourne · -",
        "keyword": "vietnam outsourcing",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "1 Aug",
        "outcome": "Lead"
      },
      {
        "date": "1 Jul",
        "name": "Dave Newman",
        "company": "PlanCare · Australia",
        "keyword": "offshore staffing",
        "asked": "Company Overview PlanCare is seeking proposals from qualified offshore staffing providers to supply a dedicated team to perform data entry and invoice entry tasks within our proprietary system. ⸻ Project Scope Staffing Requirements: • Number of staff: 15-20 offshore team members…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "1 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "3 Jul",
        "name": "Josh Higgins",
        "company": "The Basketball Fix · Australia",
        "keyword": "outsourcing video production",
        "asked": "Wanting to find an editor to create instagram shorts and youtube content which is eye catching and funny! I run a NBL basketball podcast, so want highlights through my videos etc.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "3 Jul, 9 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "6 Jul",
        "name": "Alex King",
        "company": "Alan Place · Australia",
        "keyword": "outsource video editing services",
        "asked": "Looking for a video editor who can do after effects or animation over real estate videos. Also wanting to find a figma designer.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "15 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "9 Jul",
        "name": "Jim Cunningham",
        "company": "Dindo PTY LTD · Australia",
        "keyword": "offshore outsourcing",
        "asked": "We need some traing videos and detailed user guide for our software. Is this something you can help with?",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "10 Jul",
        "name": "Annie Hall",
        "company": "Lift Health Group · Australia",
        "keyword": "outsource web app development",
        "asked": "We need a self-hosted AI platform with secure, account-based access for our clinical staff to log in and generate allied-health reports using our proprietary IP. It must enforce role-based permissions, encrypt data at rest and in transit, pass an independent penetration test, an…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "17 Jul",
        "name": "Gagandeep Singh",
        "company": "Alligator Cleaning · Australia",
        "keyword": "outsourcing app development",
        "asked": "I got application built already Need someone to add more functionality.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "21 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "22 Jul",
        "name": "Mary BUTLER",
        "company": "UniSA · Australia",
        "keyword": "outsource web design work",
        "asked": "Project Title: Development of the Centre for Welldoing Website Project Overview: The Centre for Welldoing is an evolving platform exploring the concept of \"welldoing\" through essays, reflections, reviews, resources, and creative activities. The centre currently has a presence on…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "25 Jul",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "24 Jul",
        "name": "Karen Creighton",
        "company": "Triaxial Consulting · Australia",
        "keyword": "outsourcing video production",
        "asked": "We are looking at possibly hiring someone to create LinkedIn videos similar to Sagle Construction LinkedIn videos https://www.instagram.com/reel/C_jcNQPiENJ/. These would be on an ad hoc basis. I'd like to find out what the cost of this would be. Thanks",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing nuture funnel"
      }
    ]
  },
  {
    "label": "August 2025",
    "summary": "24 leads · 4 quality · 15 booked · 0 clients",
    "leads": [
      {
        "date": "6 Aug",
        "name": "Chelsea Barlow",
        "company": "Barlow Builders · Australia",
        "keyword": "offshore outsourcing",
        "asked": "Looking for a valuable team member to join our high end custom construction industry",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "14 Aug",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "6 Aug",
        "name": "Rob Carson",
        "company": "Canopy East · -",
        "keyword": "outsource social media",
        "asked": "I only need someone part time to begin with - 1 person, perhaps 3-4 hours per week for the next month or so, and then looking to scale up",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Plant a seed"
      },
      {
        "date": "8 Aug",
        "name": "Jordan Stanley",
        "company": "Pedal Pop · Australia",
        "keyword": "3d animator for hire",
        "asked": "3d video avatar for hologram fan business. https://www.instagram.com/p/DL5GII_xW06/?hl=en .",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "8 Aug",
        "name": "Kieran Nikitaras",
        "company": "Right Path Financial Services · Australia",
        "keyword": "outsource design work",
        "asked": "We are launching a new financial planning firm, Right Path Financial Services, and need a clean, modern, and professional logo. We are open to creative alternatives, but were initially thinking of an RP monogram that subtly conveys financial growth, trust, and guidance. Preferre…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "14 Aug",
        "name": "mark Riley",
        "company": "Riley Balsawood Surfboards · Australia",
        "keyword": "outsource video editor",
        "asked": "I have a 20min video that I want edited down to 10 mins with some other content that I have.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "14 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "15 Aug",
        "name": "Jim Oshana",
        "company": "Omni Environmental Systems · -",
        "keyword": "outsourcing services",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "15 Aug",
        "outcome": "Lead"
      },
      {
        "date": "15 Aug",
        "name": "Simon Rawadi",
        "company": "Slyletica · -",
        "keyword": "outsource youtube video editing",
        "asked": "No message",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "18 Aug",
        "outcome": "Lead"
      },
      {
        "date": "20 Aug",
        "name": "Jessie Sadler",
        "company": "Christina Stephens · -",
        "keyword": "Unknown keywords (SSL)",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "21 Aug",
        "outcome": "Lead"
      },
      {
        "date": "22 Aug",
        "name": "Ryan kelley",
        "company": "Ryan Florist · -",
        "keyword": "outsourcing company",
        "asked": "yes I want know the likely hood off outsourcing someone that specialises in Google tag manager and ga4 especially with implementation. This would be for my marketing team",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "27 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "24 Aug",
        "name": "John Pearson",
        "company": "Home Shored Services · Australia",
        "keyword": "3d animator for hire",
        "asked": "Hi, I am reaching out to explore the possibility of developing health and safety training animations for my startup venture business in Australia, Home Shored Services, which focuses on the rising “working from home” culture. I have already had one training video produced locall…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "29 Aug",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "26 Aug",
        "name": "Leo Cardamone",
        "company": "Locus Design Group · -",
        "keyword": "outsourcing company",
        "asked": "not sure",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "27 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "27 Aug",
        "name": "Eloise Scott",
        "company": "Degani · Australia",
        "keyword": "offshore outsourcing",
        "asked": "Looking to refine our Power Bi documents to be more interactive and have the ability to produce more data / insights",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "27 Aug",
        "name": "Tony Nguyen",
        "company": "Finance · Australia",
        "keyword": "outsourcing company",
        "asked": "Looking for options for VA staff",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "28 Aug, 9 Feb",
        "outcome": "Closed Lost"
      },
      {
        "date": "2 Aug",
        "name": "Emma Clark",
        "company": "sdad · Albania",
        "keyword": "-",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Opportunity"
      },
      {
        "date": "4 Aug",
        "name": "Steven Lowrie",
        "company": "Support Circuits · -",
        "keyword": "overseas software development",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "5 Aug",
        "outcome": "Plant a seed"
      },
      {
        "date": "13 Aug",
        "name": "Ben Henzell",
        "company": "BFJ Digital · -",
        "keyword": "outsource design work",
        "asked": "we already have overseas designers and staff, so we are used to this process, so ultimately I’m just looking for an hourly rate",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "14 Aug",
        "outcome": "Plant a seed"
      },
      {
        "date": "13 Aug",
        "name": "Shiv Goundar",
        "company": "Butter Insurance · -",
        "keyword": "-",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "15 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "16 Aug",
        "name": "Cassandra Lee",
        "company": "Cassandra Lee Family Trust · Australia",
        "keyword": "social media outsourcing companies",
        "asked": "We are a group of businesses and are looking for digital marketing specialist that are skilled in video editing, graphics designing, for Facebook and Insta marketing campaigns.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "23 Aug",
        "name": "Liam Wood",
        "company": "outlook.com · -",
        "keyword": "back end developer",
        "asked": "no, im alright thank you",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "26 Aug",
        "name": "Norris Jajjo",
        "company": "Bluearctech · -",
        "keyword": "outsourcing company",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "26 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "27 Aug",
        "name": "Vania Martins-Fouche",
        "company": "Argyle Beverages · Australia",
        "keyword": "social media outsourcing companies",
        "asked": "Looking to accelerate our Social Media Strategy.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "29 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "27 Aug",
        "name": "Olivera Ferguson",
        "company": "The Strata Plus Group · Australia",
        "keyword": "-",
        "asked": "Reply Me",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "28 Aug",
        "name": "Alex Sandoval",
        "company": "PGG Online · Australia",
        "keyword": "-",
        "asked": "PGG Online",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "28 Aug",
        "name": "Amelia Mets",
        "company": "Pestrol · Australia",
        "keyword": "outsourcing companies",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "28 Aug",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "September 2025",
    "summary": "10 leads · 5 quality · 9 booked · 1 client",
    "leads": [
      {
        "date": "2 Sep",
        "name": "(name field holds their message)",
        "company": "Refined LIving · -",
        "keyword": "outsourcing solutions",
        "asked": "Can you draft in Microvellum",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Salesqualifiedlead"
      },
      {
        "date": "2 Sep",
        "name": "David Lloyd-Lewis",
        "company": "Folktale · Australia",
        "keyword": "offshore developers",
        "asked": "We are an Australian-based startup looking to expand our product and development capabilities",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "4 Sep",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "4 Sep",
        "name": "Yoram Cohen",
        "company": "Yumplicity Food Group · Australia",
        "keyword": "Unknown keywords (SSL)",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "12 Sep",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "9 Sep",
        "name": "Aydin Ravaz",
        "company": "Genus · Australia",
        "keyword": "offshore web development",
        "asked": "Dear CS team, We are an electrical company specialising in renewable energy projects, and we are currently operating with a QMR system built in Excel. We would like to enhance this into a more robust platform (Access, SQL, or other suitable technologies) to improve efficiency in…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "11 Sep",
        "outcome": "Closed Lost"
      },
      {
        "date": "10 Sep",
        "name": "Jorell Magtibay",
        "company": "Elezar · Australia",
        "keyword": "full stack developer",
        "asked": "Looking for a full stack developer to help me bring a product into production and ongoing support. Startup Located in Melbourne. Looking ASAP .",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "11 Sep",
        "outcome": "Closed Lost"
      },
      {
        "date": "15 Sep",
        "name": "Rohit Kapoor",
        "company": "Wise Monkeys · -",
        "keyword": "content writer for hire",
        "asked": "Looking for maths content writers to help refine, enrich and format our existing Maths booklets. Going forward assisting with creation and assessment of tests",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "17 Sep",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 Sep",
        "name": "Mandeep Sodhi",
        "company": "Effi Technologies Pty Ltd · Australia",
        "keyword": "devops engineer",
        "asked": "We are looking for lead devops engineer and keen to understand the pricing",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "22 Sep",
        "outcome": "Closed Lost"
      },
      {
        "date": "13 Sep",
        "name": "Mitchell Jenkinson",
        "company": "Edvanced · Australia",
        "keyword": "digital marketing specialist",
        "asked": "Early days into an education company. Looking for help getting new students with a small budget.",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "15 Sep",
        "outcome": "Closed Lost"
      },
      {
        "date": "14 Sep",
        "name": "Emma Dawes",
        "company": "CPMA · Australia",
        "keyword": "full stack developer",
        "asked": "Looking for portal development for an online service that service users can create modify store information and that can be accessed by admin - however is only done so in certain circumstances. Moderate security needed",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "15 Sep",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "29 Sep",
        "name": "Mark Kimo",
        "company": "Creative Matter · -",
        "keyword": "digital marketing specialist",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "3 Oct, 21 Oct",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "October 2025",
    "summary": "18 leads · 9 quality · 9 booked · 3 clients",
    "leads": [
      {
        "date": "5 Oct",
        "name": "SCOTT",
        "company": "gmail.com · Australia",
        "keyword": "outsourcing services",
        "asked": "I'm just after the operation menu",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "6 Oct",
        "name": "Darwin Lentija",
        "company": "Ahvana · Australia",
        "keyword": "outsourcing companies",
        "asked": "Hi, I am researching hiring a VA, as well as website completion & IT services. Thank you Melissa",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "10 Oct",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "7 Oct",
        "name": "Thomas Le",
        "company": "ACTIV Rehab and Wellness · United States",
        "keyword": "outsource accounts receivable",
        "asked": "I deal with personal injury cases in my clinic and I have some accounts receivables with some law firms. I need someone to help manage and follow-up with these cases. It's not too much and would only be a temporary job until we're all caught up.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "7 Oct",
        "name": "Samantha Luu",
        "company": "Cloud Based IT Infrastructure · Australia",
        "keyword": "vietnam it outsourcing",
        "asked": "Hello, I would like to enquire about hiring an IT support person with 3-4 years of experience, managing level 2-3 IT queries.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "8 Oct",
        "outcome": "Closed Lost"
      },
      {
        "date": "8 Oct",
        "name": "Hussein Soubra",
        "company": "hotmail.com · Australia",
        "keyword": "outsource company",
        "asked": "I need someone to make me capabillity statements and other work",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "9 Oct",
        "name": "David castle",
        "company": "Borderless Mobile · United States",
        "keyword": "back end developer",
        "asked": "I’m looking for someone that can do front end and back end API integration",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "9 Oct",
        "name": "Claire Wong",
        "company": "NGU Group · Australia",
        "keyword": "outsourcing companies",
        "asked": "I'm looking for a outsource web design & developer, will you be able to help me?",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "10 Oct",
        "name": "Losaline Fotuaika",
        "company": "Famili next care · Australia",
        "keyword": "outsource admin work",
        "asked": "NDiS provider need admin assistant to onboard clients.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "16 Oct",
        "name": "Eunice Liu",
        "company": "Leschaco · United States",
        "keyword": "outsourcing company",
        "asked": "Interested in accounting staff outsource",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "28 Oct, 4 Nov, 18 Dec, 9 Jun, 1 Jul, 2 Sep",
        "outcome": "Became a clientdeal 1, deal 2, deal 3"
      },
      {
        "date": "26 Oct",
        "name": "Bridee Arrighi",
        "company": "Connect Media · Australia",
        "keyword": "outsource data entry",
        "asked": "Looking for information on data cleansing and enrichment solutions. Ideally to outsource reviewing, validating, standardizing, and maintaining large datasets.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "28 Oct",
        "name": "Hayley Haveman",
        "company": "iShoot Photobooth · Australia",
        "keyword": "outsource admin work",
        "asked": "After a VA who can handle website and social media management",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "28 Oct",
        "outcome": "Closed Lost"
      },
      {
        "date": "9 Oct",
        "name": "luis feliz",
        "company": "Directfile · United States",
        "keyword": "offshore data entry services",
        "asked": "We have an existing system and lost our developer. We are a small organization looking for someone to review our app and then work on some changes that are needed. Need changes to increase sales. The app is a collection o technologies. PHP/JQuery front end, Postgres SQL Database…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "9 Oct",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "9 Oct",
        "name": "Susan Packham",
        "company": "Connectivity Care Solutions · Australia",
        "keyword": "offshore outsourcing",
        "asked": "Hi, I am looking for a candidtate to set up my social media platforms please.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "9 Oct",
        "name": "Frankie Kelley",
        "company": "Marwood · United States",
        "keyword": "outsourcing company",
        "asked": "Interested in learning about your services, including survey programming, slide creation, marketing materials, and more",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "10 Oct",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "23 Oct",
        "name": "Davd Musgrave",
        "company": "Able Corporate Transport Pty Ltd · Australia",
        "keyword": "it outsourcing company",
        "asked": "I need IT Specialists to maintain and update as required a bookings and accounting package we had designed and built in China on an ongoing basis. I deal a lot with AWS and we pay them monthly for Cloud Based Storage of our system. We operate a Cloud Based program that is interl…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "24 Oct",
        "outcome": "Closed Lost"
      },
      {
        "date": "23 Oct",
        "name": "Aaron Waite",
        "company": "Onyx Agency · Australia",
        "keyword": "3d animation artist for hire",
        "asked": "Hi, I’m reaching out from Onyx Agency as we’re looking to connect with talented 3D renderers for potential future collaborations on exhibit designs for events. We’re looking for: - 8-10 renders (both frontside and aerial) - Three rounds of revisions - A video walkthrough of the…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "24 Oct",
        "name": "Tandy machisa",
        "company": "your defence advocates · Australia",
        "keyword": "digital marketing outsourcing",
        "asked": "Looking for google ads for a new business commencing in November",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "27 Oct",
        "outcome": "Closed Lost"
      },
      {
        "date": "16 Oct",
        "name": "Sean Lee",
        "company": "KLAIR LIVING · United States",
        "keyword": "outsourcing company",
        "asked": "No message",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "17 Oct, 24 Oct",
        "outcome": "Became a clientSigned Oct 2025; deal closed lost Mar 2026"
      }
    ]
  },
  {
    "label": "November 2025",
    "summary": "21 leads · 9 quality · 13 booked · 0 clients",
    "leads": [
      {
        "date": "13 Nov",
        "name": "Jenny Schmitdke",
        "company": "ANYMEAT PTY LTD · Australia",
        "keyword": "offshore software development services",
        "asked": "Company Context We are an Australian non-packer exporter specializing in international meat trade. Our mission is to modernize and digitize our export operations to improve transparency, efficiency, and global reach. Project Scope: GrazeWays MVP + Website Overhaul This initiativ…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "17 Nov",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "14 Nov",
        "name": "Ricky Singh",
        "company": "Snap Car Wash · Australia",
        "keyword": "offshore staff",
        "asked": "Graphic Designer and/or Marketing looking to Hire",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "18 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "15 Nov",
        "name": "Mat Kasem",
        "company": "DirectMeds Services · Australia",
        "keyword": "business outsourcing services",
        "asked": "We're looking for a seasoned marketing professional with around five-plus years of experience who excels in both paid marketing, like Google, Meta and Facebook campaigns, and has strong analytical skills. They should be comfortable making data-driven decisions, tracking setup, h…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "19 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "17 Nov",
        "name": "Grace Jones",
        "company": "LMTLS Finance · Australia",
        "keyword": "Unknown keywords (SSL)",
        "asked": "Hi, We are a new start up business near Brisbane focussed on asset broking (no mortgages) we are looking for a marketting team who would be able to assist in promoting our business, making us stand out. I was wondering if there is a PDF with plans/costs for review? We look forwa…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "18 Nov",
        "name": "Brad",
        "company": "KC's Roofing and Patios · Australia",
        "keyword": "c1d25565-f664-4089-9f0a-1734cc1b3a65",
        "asked": "Looking for a cost effective solution to convert mvp's into working apps/saas products.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "19 Nov",
        "name": "Corey",
        "company": "gmail.com · Australia",
        "keyword": "Unknown keywords (SSL)",
        "asked": "Hey I am after a design to put on my mobile dog wash trailer and also flyers and shirts to be printed please",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Unqualified - Not Model Aligned"
      },
      {
        "date": "26 Nov",
        "name": "Joel Shaddock",
        "company": "joelshaddock.com · Australia",
        "keyword": "Unknown keywords (SSL)",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Send back to marketing for nurture"
      },
      {
        "date": "7 Nov",
        "name": "Cam McPherson",
        "company": "Total Tools · Australia",
        "keyword": "full stack engineer",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "18 Nov",
        "outcome": "Sales Qualified Lead"
      },
      {
        "date": "7 Nov",
        "name": "Michael Seif",
        "company": "Enterprise Evolve · Australia",
        "keyword": "offshore staffing company",
        "asked": "Looking to hire a full stack developer",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "7 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "13 Nov",
        "name": "Alexis Miller",
        "company": "Gen3 Innovations Lab · United States",
        "keyword": "outsourcing company",
        "asked": "I need staf\\f that can help with lead generation and creating sales funnels and potentially later down the line a head of finance to help with my business.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "14 Nov",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "15 Nov",
        "name": "Emily Mason",
        "company": "The Martec · Australia",
        "keyword": "outsourcing companies",
        "asked": "Looking to contract 1-2 Vietnam-based UX/UI Designers to work closely with our Vietnamese development team. Responsibilities include: - Designing for agentic solutions - Designing for B2B SaaS We are an AI-driven Employer Branding software company, working with enterprise client…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "24 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "18 Nov",
        "name": "Posh Eddy",
        "company": "Sooshi Mango · Australia",
        "keyword": "outsource company",
        "asked": "Hi there, Hope you're well. We are looking to hire an offshore editor for our social media platforms. We are seeking someone for the below; Editing social media content - reels/videos Providing raw files, and editing the videos Ease of communication - to allow for back and forth…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "20 Nov",
        "name": "Courtney Quinn",
        "company": "Manemerised · Australia",
        "keyword": "it outsourcing company",
        "asked": "social media management and marketiing",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "20 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "20 Nov",
        "name": "Nathan Liang",
        "company": "By Intuity · Australia",
        "keyword": "-",
        "asked": "We’re looking for a world-class video editor who goes beyond basic editing and understands marketing strategy. You must be able to edit across multiple formats - professional and intimate VSLs, high-engagement Instagram Reels, and performance-driven paid ads with strong 3-second…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "24 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "21 Nov",
        "name": "omar",
        "company": "gmail.com · Egypt",
        "keyword": "full stack web developer",
        "asked": "Hi there, I have a project that I need some help with here's the notion page https://www.notion.so/Project-Brief-AI-Powered-Life-Coaching-Accountability-Bot-2aeeff98a97780d2a058d2877093b2b7?source=copy_link",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Unqualified - Not Model Aligned"
      },
      {
        "date": "22 Nov",
        "name": "Joseph Candito",
        "company": "CANDITO MANAGEMENT GROUP, INC · United States",
        "keyword": "payroll outsourcing",
        "asked": "I am currently exploring payroll services for my employees.",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "25 Nov",
        "outcome": "Closed lost"
      },
      {
        "date": "24 Nov",
        "name": "Jovi Dickson",
        "company": "Toy Monster · Australia",
        "keyword": "digital marketing specialist",
        "asked": "Hi! We’re currently scoping an animated TVC for a new character-led product launch (kids, parents, teens & collectors). We’re looking for an animation studio to help bring playful, joyful characters to life, including concepting, storyboards, animation, sound and social cutdowns…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "26 Nov",
        "outcome": "Closed Lost"
      },
      {
        "date": "25 Nov",
        "name": "Naomi Brummtit",
        "company": "Iberdrola · Australia",
        "keyword": "-",
        "asked": "Hi there, We’re looking to create a 3‑minute farewell video for our CEO. Our plan is to have different people across the business record a short video (up to 20 seconds) on their iPhone to share their thanks. We’d like someone to edit these clips into a cohesive, engaging video,…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "26 Nov",
        "name": "Katherine Takchi",
        "company": "flavadesigns.com.au · Australia",
        "keyword": "3d animation artist for hire",
        "asked": "I am looking specifically for 3d animation videos and images graphic design, and as well possibly someone who would help with video editing - i have a social media management company so they would be helping across a few different business' accounts",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "27 Nov",
        "outcome": "In progress"
      },
      {
        "date": "28 Nov",
        "name": "simon wheeler",
        "company": "Zenodist · Australia",
        "keyword": "content writer for hire",
        "asked": "just need pricing for content creators and how much they cost",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "28 Nov",
        "name": "Harry Vo",
        "company": "HV Tax · Australia",
        "keyword": "-",
        "asked": "Hi I’m looking to upgrade my brand and expand my practice as I prepare to scale. Ideally, I’d like to rebrand and develop a complete new brand identity and website, and I’m exploring my options. My goal is to position the firm as a boutique accounting practice delivering Big 4-l…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "28 Nov",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "December 2025",
    "summary": "11 leads · 5 quality · 7 booked · 2 clients",
    "leads": [
      {
        "date": "8 Dec",
        "name": "Leigh Doyle",
        "company": "Skyward Digital Solutions Pty Ltd · Australia",
        "keyword": "Unknown keywords (SSL)",
        "asked": "Looking for Graphic Designer services.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "9 Dec",
        "outcome": "Closed Lost"
      },
      {
        "date": "12 Dec",
        "name": "James Clarke",
        "company": "CLARKE FILMS · Australia",
        "keyword": "Unknown keywords (SSL)",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Send back to marketing for nurture"
      },
      {
        "date": "16 Dec",
        "name": "K.J. Lee",
        "company": "213PNM · United States",
        "keyword": "digital marketing specialist",
        "asked": "We are looking for a marketing team who can handle theatrical distribution marketing and digital marketing including SNS growth.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "18 Dec",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "16 Dec",
        "name": "Robert Meyer",
        "company": "RAD WAREHOUSE LLC · United States",
        "keyword": "offshore staffing",
        "asked": "Payroll services",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "19 Dec, 28 Feb, 16 Apr",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "22 Dec",
        "name": "Alessio",
        "company": "gmail.com · Australia",
        "keyword": "social media outsourcing companies",
        "asked": "No message",
        "gradeKey": "poorlite",
        "grade": "Poor: personal email, no message",
        "meeting": "-",
        "outcome": "Send back to marketing for nurture"
      },
      {
        "date": "24 Dec",
        "name": "Nic Raja",
        "company": "Roger and Carson · Australia",
        "keyword": "outsource data entry",
        "asked": "Data entry staff",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "25 Dec",
        "outcome": "Closed Lost"
      },
      {
        "date": "26 Dec",
        "name": "Carl Malone",
        "company": "Rambus · -",
        "keyword": "c1d25565-f664-4089-9f0a-1734cc1b3a65",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "29 Dec",
        "outcome": "In progress"
      },
      {
        "date": "1 Dec",
        "name": "JAPJEE SINGH",
        "company": "JP Tax Advisors · -",
        "keyword": "payroll outsourcing companies",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "5 Dec",
        "outcome": "In progress"
      },
      {
        "date": "3 Dec",
        "name": "Rams",
        "company": "Luvella · Australia",
        "keyword": "-",
        "asked": "Looking for digital marketing",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Send back to marketing for nurture"
      },
      {
        "date": "5 Dec",
        "name": "Eric Chen",
        "company": "Therapursuit · Australia",
        "keyword": "outsource admin services",
        "asked": "We need to increase our capacity for handling customer enquiries, scheduling and booking in clients with clinicians, capturing initial client info, onboarding new clients, communicate internally with clinicians.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "5 Dec",
        "outcome": "Closed Lost"
      },
      {
        "date": "6 Dec",
        "name": "Jennifer KB",
        "company": "Sheallures · -",
        "keyword": "-",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      }
    ]
  },
  {
    "label": "January 2026",
    "summary": "17 leads · 7 quality · 13 booked · 1 client",
    "leads": [
      {
        "date": "2 Jan",
        "name": "Will C",
        "company": "Breakawayhoops.com · United States",
        "keyword": "digital marketing specialist",
        "asked": "Digital Marketer",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "12 Jan",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "4 Jan",
        "name": "Nicole Chan",
        "company": "The Pink Elephant · Australia",
        "keyword": "digital marketing specialist",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "12 Jan",
        "outcome": "In progress"
      },
      {
        "date": "7 Jan",
        "name": "Yuko Ochi",
        "company": "Sekisui House Australia Pty Ltd · Australia",
        "keyword": "outsource administrative work",
        "asked": "Looking for a virtual receptionist to answer phone calls.",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "12 Jan",
        "outcome": "Closed Lost"
      },
      {
        "date": "10 Jan",
        "name": "Jacqueline Monteiro",
        "company": "Baini design · Australia",
        "keyword": "3d animator for hire",
        "asked": "Hi, I would like to hire someone to illustrate, animate and prepare a 10 minute children's cartoon for Youtube and Youtube Shorts. Please let me know if you can assist.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "14 Jan",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "12 Jan",
        "name": "David Miles",
        "company": "sphericaldev.com · -",
        "keyword": "Unknown keywords (SSL)",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Send back to marketing for nurture"
      },
      {
        "date": "13 Jan",
        "name": "Mark Day",
        "company": "Catapult · Australia",
        "keyword": "devops engineer",
        "asked": "1 x DevOps and 1 x QA Engineer",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "14 Jan, 27 May",
        "outcome": "Became a clientSigned; not yet marked won in HubSpot"
      },
      {
        "date": "14 Jan",
        "name": "Good morning",
        "company": "gmail.com · Australia",
        "keyword": "offshore software development company",
        "asked": "I’m looking for a shopify website to be built, currently have an Etsy site only. I’m not wanting anything else at this stage other than a website. I have had multiple meetings with other outsource companies who push from all other services. I’m not in a financial situation to be…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Unqualified - Not Model Aligned"
      },
      {
        "date": "22 Jan",
        "name": "Yosef Arnall",
        "company": "Curved Health LLC · United States",
        "keyword": "digital marketing expert",
        "asked": "About Curved Curved is a tech-enabled body-contouring platform delivering high-quality liposuction through board-certified surgeons, transparent pricing, and a patient-first experience. We’re building a modern, trusted aesthetic healthcare brand, launching in Southern California…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "22 Jan",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "22 Jan",
        "name": "Ashlynn Ruman",
        "company": "Canopy Management · United States",
        "keyword": "content writer for hire",
        "asked": "Looking for support for Amazon-specific SEO/Copywriting for our team. Interested in talking more- thanks!",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "28 Jan",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "24 Jan",
        "name": "Julie Niland",
        "company": "Saint Peter · Australia",
        "keyword": "offshore developers",
        "asked": "Hi, I am making an app and need a developer to help with integrating a third-party video generation API",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "28 Jan",
        "outcome": "In progress"
      },
      {
        "date": "31 Jan",
        "name": "Jeremy Wood",
        "company": "Glenview Finance · United States",
        "keyword": "outsourcing solutions",
        "asked": "We are wanting in inquire about your ability for outsourcing our underwriting for indirect auto loans",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "3 Feb",
        "outcome": "Closed lost"
      },
      {
        "date": "8 Jan",
        "name": "Dione Mahan",
        "company": "Engage The Voter, LLC · United States",
        "keyword": "outsource data entry",
        "asked": "We’re seeking data entry personnel to support essential ballot initiative operations. Key responsibilities include high-volume data entry and precise, real-time cross-validation against client voter registration databases. This role requires exceptional typing proficiency, unwav…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "10 Jan",
        "outcome": "Closed lost"
      },
      {
        "date": "14 Jan",
        "name": "michael gorman",
        "company": "Gorman ProMed · Australia",
        "keyword": "offshore software development company",
        "asked": "Hi I have a product BuzzPOD and would like to bring the software up to data.. I wrote it in VB6 a decade ago. The software reads batch data from the BuzzPOD device via VCP/USB and analyses that data, then results are stored/graphical display of results is completed. I am looking…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "14 Jan",
        "name": "Hasini",
        "company": "gmail.com · Australia",
        "keyword": "outsource data entry",
        "asked": "Im looking for online data entry job",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "16 Jan",
        "name": "Geoffrey Bowll",
        "company": "Starship · Australia",
        "keyword": "data analytics outsourcing companies",
        "asked": "Wanting a quant job - about 200 professionals x 25 questions. Can someone get back to us asap? Geoff 0400284411",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "16 Jan",
        "outcome": "Closed Lost"
      },
      {
        "date": "19 Jan",
        "name": "Kevin Gonzales",
        "company": "WorkGarden · United States",
        "keyword": "offshore software development",
        "asked": "We need a lot of talented software engineers who are good at both technology and communication in verbal English(Business Fluency). The tech stack we are looking for is one of C#, Data Science(AI/ML), Data Engineering(Big data management), Data Analysis and Java. Look forward to…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "28 Jan",
        "outcome": "Closed lost"
      },
      {
        "date": "28 Jan",
        "name": "Tyler Laurinaitis",
        "company": "Choice Cabinet · United States",
        "keyword": "it outsourcing",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "29 Jan",
        "outcome": "Plant a seed"
      }
    ]
  },
  {
    "label": "February 2026",
    "summary": "24 leads · 7 quality · 6 booked · 0 clients",
    "leads": [
      {
        "date": "3 Feb",
        "name": "Irina Smoltis",
        "company": "Terem · Australia",
        "keyword": "it outsourcing",
        "asked": "We are looking for an offshore QA Engineer",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "4 Feb",
        "outcome": "Closed Lost"
      },
      {
        "date": "4 Feb",
        "name": "Tony Bennett",
        "company": "itstheothertonybennett.com · United States",
        "keyword": "3d animation artist for hire",
        "asked": "I have someone that started my digital invention prototype for my website by left me high and dry and I need a team to complete a 5 minute AI Narrated - 3D Animated Presentation,",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "5 Feb",
        "outcome": "Closed lost"
      },
      {
        "date": "5 Feb",
        "name": "Kane Wallace",
        "company": "SCRAMBLE · Australia",
        "keyword": "game designer",
        "asked": "Hi Team, I am looking for a member or two to help me with the development of a new Trading Card Game, I will need help with the design of mechanics, play testing, artwork, marketing and disturbing. Thankyou",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "11 Feb",
        "name": "Axel Karlsson-Lacy",
        "company": "Axxa Golf · Australia",
        "keyword": "outsource bookkeeping",
        "asked": "Hi there, Looking for a bookkeeper as we have recently signed up for gst. we will do about 200k this financial year. We do everything through xero, and are about to start part time workers so would need help with setting up payroll etc. We dont have heaps and heaps of transactio…",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "14 Feb",
        "name": "Henry",
        "company": "halimiusa.com · United States",
        "keyword": "offshore developers",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "15 Feb",
        "name": "Justin Kadash",
        "company": "CJ Solution · United States",
        "keyword": "digital advertising specialist",
        "asked": "My name is Justin, and I run several online websites that sell novelty and replica diplomas and transcripts. I’m looking to relaunch Google Ads with the right team in place - one that can help us keep our account active, compliant, and optimized long term. We operate a professio…",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "15 Feb",
        "name": "Juliette Polesy",
        "company": "H POLESY & Co · Australia",
        "keyword": "outsourcing financial services",
        "asked": "We are looking at outsourcing our transactional accounting",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "17 Feb",
        "name": "Bruno",
        "company": "BC Property Agents · Australia",
        "keyword": "outsourcing staff",
        "asked": "what does it cost for a video editor",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "17 Feb",
        "name": "Ryan Lee",
        "company": "JSJ Accounting · Australia",
        "keyword": "offshore software development company",
        "asked": "I am looking for the PA role who speak English and Korean, and Vietnamese.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "19 Feb",
        "outcome": "Closed Lost"
      },
      {
        "date": "17 Feb",
        "name": "Robert",
        "company": "gmail.com · Australia",
        "keyword": "offshore it outsourcing",
        "asked": "Hands-Free VA Needed - Run a Daily 2-Minute Motivational WhatsApp Program Do you want to manage a high-converting, fully automated digital service without constant supervision? We’re looking for a tech-savvy, organized Virtual Assistant to run Ultimate Success Mind, a daily moti…",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "17 Feb",
        "name": "Maria Karantziounis",
        "company": "C-Ceuticals · Australia",
        "keyword": "outsourcing app development",
        "asked": "Please contact me on maria.karantziounis@gmail.com as this is a personal request not one for my business for a game app developer. I wish to develop an app. Benchmark is fruitninja,tetris,bubble pop,block blast.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "18 Feb",
        "name": "Lisa Nevens",
        "company": "Temptation Bakeries · Australia",
        "keyword": "3d animator for hire",
        "asked": "Hi there, I am looking for someone that can help me build websites and content but most important can do full 3d cartoons taking the cartoons, allowing them to speak and do music and sounds to the cartoon.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "20 Feb",
        "outcome": "Closed Lost"
      },
      {
        "date": "18 Feb",
        "name": "Parul",
        "company": "gmail.com · Australia",
        "keyword": "outsourced social media management",
        "asked": "need to know more about instagram page managing and marketing for small business",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "2 Feb",
        "name": "Lucas Mantovani",
        "company": "Velvet · United States",
        "keyword": "vietnam outsourcing",
        "asked": "Hi Away team, I'm Lucas Mantovani, the CEO of an American AI company called Velvet. I'm interested in working with you to connect with manufacturing facilities. Please let me know if you are interested in meeting so we can discuss more details. Best, Lucas",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "3 Feb",
        "outcome": "Closed lost"
      },
      {
        "date": "5 Feb",
        "name": "Misty Cheng",
        "company": "MV Cheng & Associates · United States",
        "keyword": "outsource admin work",
        "asked": "Need an admin staff for secretary and bookkeeping work.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "10 Feb",
        "name": "Bonnie Zhang",
        "company": "austrlia · Australia",
        "keyword": "outsource it services",
        "asked": "ITintial set up for our dealship",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "12 Feb",
        "name": "Emanuele Antonio",
        "company": "M22 Group · Australia",
        "keyword": "content writer for hire",
        "asked": "We need an experienced content writer for 2 websites we need set up - we’re looking for a fixed price quote",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "14 Feb",
        "name": "Adam Sobczak",
        "company": "Amber Wealth pty ltd · Australia",
        "keyword": "outsource bookkeeping",
        "asked": "Looking for a part time bookkeeper,",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "15 Feb",
        "name": "Liam",
        "company": "gmail.com · Canada",
        "keyword": "game designer",
        "asked": "Hi",
        "gradeKey": "neutral",
        "grade": "Not enough detail",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "17 Feb",
        "name": "Hilda Njoka",
        "company": "Girvan Group · Australia",
        "keyword": "outsource it services",
        "asked": "Please provide quote for your managed IT services",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "21 Feb",
        "name": "Matthew Wigginton",
        "company": "Vitalic Energy · Australia",
        "keyword": "3d animator for hire",
        "asked": "Require a USP explainer 3D animated video",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "21 Feb",
        "name": "Beau Mifsud",
        "company": "Kearneygroup · Australia",
        "keyword": "outsourcing companies",
        "asked": "Looking to partner with someone for php developers and angular developers, looking for full time roles, planning on increasing the team quite significantly with the right partner and talent.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "23 Feb",
        "outcome": "Closed Lost"
      },
      {
        "date": "25 Feb",
        "name": "parul jolly",
        "company": "coco party · Australia",
        "keyword": "outsource website development",
        "asked": "Small business content creation, social media marketing, digital marketing",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "27 Feb",
        "name": "Tatiana Marquez",
        "company": "Ghost Rocket Music · United States",
        "keyword": "outsource receivables",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Marketing nuture funnel"
      }
    ]
  },
  {
    "label": "March 2026",
    "summary": "18 leads · 9 quality · 5 booked · 1 client",
    "leads": [
      {
        "date": "3 Mar",
        "name": "Zelia",
        "company": "gmail.com · Australia",
        "keyword": "outsource graphic designer",
        "asked": "Wanting pricing for logo design, already have logos that I want, just need a few things changed & tweaked",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Unqualified - Not Model Aligned"
      },
      {
        "date": "5 Mar",
        "name": "Billy Somaia",
        "company": "Simba Global · Australia",
        "keyword": "outsource marketing",
        "asked": "We have a emerging e-commerce business http://shop.simba.global. Looking for digital marketing support to help achieve our strategic targets and goals",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "10 Mar",
        "outcome": "Closed Lost"
      },
      {
        "date": "7 Mar",
        "name": "Eric Brown",
        "company": "Go2 Delivery · United States",
        "keyword": "outsource marketing",
        "asked": "Looking to hire B2B Growth Marketing Manager",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "11 Mar",
        "outcome": "Became a client"
      },
      {
        "date": "10 Mar",
        "name": "Deena Haibe",
        "company": "NSW Planning Management · Australia",
        "keyword": "3d animator for hire",
        "asked": "I am looking to create personal animated videos based on stories I have already written. My goal is to turn these stories into short animated films. I would appreciate guidance on the process of producing these animations, including the tools, workflow, and any resources that co…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "In progress"
      },
      {
        "date": "13 Mar",
        "name": "alex",
        "company": "Kale Properties · United States",
        "keyword": "outsourcing accounting services",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "13 Mar",
        "name": "Kevin Clavell",
        "company": "Clavell Media · United States",
        "keyword": "3d animation artist for hire",
        "asked": "I'm looking to hire 3D animators to join my company Clavell Media. We focus on 3D animations for long form YouTube Videos.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "13 Mar",
        "name": "(name field holds their message)",
        "company": "Property Subdivision · Australia",
        "keyword": "outsource bookkeeping",
        "asked": "seeking price for a bookkeeper for a new business",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "21 Mar",
        "name": "Tamara Husler",
        "company": "Wines by Ruby · Australia",
        "keyword": "media outsourcing",
        "asked": "I require someone to edit videos for social media. I need up to 5 videos per week at most.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Unqualified - Not Model Aligned"
      },
      {
        "date": "23 Mar",
        "name": "Audrea Pollard",
        "company": "Candy shop ll · United States",
        "keyword": "c1d25565-f664-4089-9f0a-1734cc1b3a65",
        "asked": "I would like to try your products",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "In progress"
      },
      {
        "date": "26 Mar",
        "name": "Eric Smith",
        "company": "TA Logistics · Canada",
        "keyword": "logistics outsourcing",
        "asked": "No message",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "In progress"
      },
      {
        "date": "27 Mar",
        "name": "Missy Meaney",
        "company": "BondiBoost · Australia",
        "keyword": "3d animator for hire",
        "asked": "We are looking for a someone to create 5 videos a week for our brand like this https://www.instagram.com/reel/DTp-5FcjIGm/?igsh=MWRqaThiNTB2bzcxbw== https://www.instagram.com/ree…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "31 Mar",
        "outcome": "Closed Lost"
      },
      {
        "date": "30 Mar",
        "name": "Oscar Medina",
        "company": "East Side Clothing Co. · Australia",
        "keyword": "digital marketing specialist",
        "asked": "Hello, My name is Oscar, and I’m reaching out on behalf of East Side Clothing Co. We’ve recently partnered with a team to support our Meta marketing efforts, however we’ve run into issues with our Meta Pixel setup across our Shopify stores. At the moment, the pixel is not tracki…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "3 Mar",
        "name": "Ash Warsi",
        "company": "globalclimatecompany.com.au · Australia",
        "keyword": "outsource data entry",
        "asked": "We are a sustainability advisory in australia and we need help with sales, lead generation.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "4 Mar",
        "outcome": "Closed Lost"
      },
      {
        "date": "5 Mar",
        "name": "Omar Hawari",
        "company": "Hyperia co · Australia",
        "keyword": "graphic designers outsourcing",
        "asked": "I'm after an experienced and professional graphic designer full time.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "13 Mar",
        "name": "cleve",
        "company": "gmail.com · Australia",
        "keyword": "dedicated shopify developer",
        "asked": "I’m not sure if your services are more high end ($) in comparison to say upwork etc and therefore I’ll drop what I’m doing in here and leave it with you guys if you’d mind taking a look and giving me a ballpark thanks. We have a Shopify store that requires variant work to conver…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Unqualified - Not Model Aligned"
      },
      {
        "date": "17 Mar",
        "name": "Jason Cervera",
        "company": "Nationwide MEdical billing · United States",
        "keyword": "outsourcing companies",
        "asked": "WHAT IS YOUR PRICING MODEL AND ALSO DO YOU HAVE EXP. MEDICAL BILLING PEOPLE ???",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "27 Mar",
        "name": "aviv levi",
        "company": "firststop · United States",
        "keyword": "hire technical writer",
        "asked": "looking for copywriter for client text messages/emails engagment",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "31 Mar",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "31 Mar",
        "name": "sergio lopez",
        "company": "gmail.com · United States",
        "keyword": "accounts payable bpo",
        "asked": "No message",
        "gradeKey": "poorlite",
        "grade": "Poor: personal email, no message",
        "meeting": "-",
        "outcome": "Lead"
      }
    ]
  },
  {
    "label": "April 2026",
    "summary": "24 leads · 8 quality · 11 booked · 0 clients",
    "leads": [
      {
        "date": "2 Apr",
        "name": "Michael Burns",
        "company": "Make Data Work For You · Australia",
        "keyword": "data engineer",
        "asked": "Seeking Data Engineering staff. Azure/Fabric/PowerBI/Pyspark/Datawarehousing. Deployment of warehouse solution and custom curtated/power bi for international clients.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "7 Apr",
        "outcome": "Closed Lost"
      },
      {
        "date": "2 Apr",
        "name": "linda chen",
        "company": "A Plus Accountant · Australia",
        "keyword": "outsourcing companies",
        "asked": "I like to discuss your charges",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "3 Apr",
        "outcome": "Lead"
      },
      {
        "date": "7 Apr",
        "name": "arvin scott",
        "company": "Autosled, Inc · United States",
        "keyword": "outsource marketing",
        "asked": "interested in learning how your team can support SEM, marketing materials, LinkedIn. content, copy for the website,",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "8 Apr",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "8 Apr",
        "name": "(name field holds their message)",
        "company": "gmail.com · Australia",
        "keyword": "outsource shopify developer",
        "asked": "looking for help with my Shopify business?",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "9 Apr",
        "name": "Simone Weekes",
        "company": "Life Jacket Marine Supplies · Australia",
        "keyword": "search engine optimization specialist",
        "asked": "We are wanting to see what options are available regarding SEO Optimisation.",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "10 Apr",
        "outcome": "Closed Lost"
      },
      {
        "date": "11 Apr",
        "name": "PETER D",
        "company": "Onasta Care Pty Ltd · Australia",
        "keyword": "content writer for hire",
        "asked": "Hi Cait, I have found your information online. We are setting up a new business for NDIS support. So we need a content writer for my new website Please check the link below and possibly give a quote. If you need any further information, please do not hesitate to call me on 04113…",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "13 Apr, 18 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 Apr",
        "name": "Keith Cusack",
        "company": "Sandy Alexander · United States",
        "keyword": "outsourcing services",
        "asked": "We are in need of an estimator for wide format printing, please reach out as soon as possible, thank you",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "25 Apr",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "22 Apr",
        "name": "Kien Hoang",
        "company": "Insta Property · Australia",
        "keyword": "outsourcing companies",
        "asked": "Hi, we are a real estate business, we looking for an admin/marketing person, in future we will need a video editor too. Please let me know the cost. Thank you",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "22 Apr",
        "outcome": "Closed Lost"
      },
      {
        "date": "24 Apr",
        "name": "(name field holds their message)",
        "company": "gmail.com · China",
        "keyword": "outsource content",
        "asked": "contact me",
        "gradeKey": "poorlite",
        "grade": "Poor: personal email, no message",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "26 Apr",
        "name": "(name field holds their message)",
        "company": "gmail.com · United States",
        "keyword": "outsource shopify developer",
        "asked": "William T Merola creator of energy 4u App to reduce co2 Emissions Worldwide for Humanity. Cost for affiliate shoppify Merola",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "26 Apr",
        "name": "Martha Torkington",
        "company": "The Be You Method · United States",
        "keyword": "outsource shopify developer",
        "asked": "Looking for someone to build shopify store",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "27 Apr",
        "name": "Matej Varhalik",
        "company": "SpeedFit · Australia",
        "keyword": "outsource app development",
        "asked": "Review possible pathways to build our own Customer App and EMS training platform",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "30 Apr",
        "outcome": "Closed Lost"
      },
      {
        "date": "28 Apr",
        "name": "Michael Jezek",
        "company": "Starbrand.Studio · United States",
        "keyword": "outsource company",
        "asked": "Hi - quick question. I’m currently lining up offshore partners to support a steady flow of B2B and finance-facing projects - primarily infographics, pitch decks, and report/whitepaper design. I came across Away Digital Teams and wanted to see if you have dedicated design capabil…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "29 Apr",
        "name": "Robert Anderson",
        "company": "Flatiron Dragados · United States",
        "keyword": "outsourcing business",
        "asked": "Thank you. We are looking for a reliable brokerage partner for our ongoing shipping needs. Dependability and efficiency are very important to us.",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Closed lost"
      },
      {
        "date": "29 Apr",
        "name": "Joshua",
        "company": "gmail.com · Australia",
        "keyword": "game designer for hire",
        "asked": "I'm looking for a mid level unreal engine 5 developer to assist me in developing a video game",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "30 Apr",
        "name": "Carry Lam",
        "company": "EPROLO · China",
        "keyword": "content creation outsourcing",
        "asked": "Hi Team, I would like to enquiry about the SEO article writing for outsourcing. I need to know the pricing and how it works. Thanks. Regards, Carry Lam",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "12 May",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "2 Apr",
        "name": "Peter Jorgensen",
        "company": "Spiral Logistics · Australia",
        "keyword": "outsourcing companies",
        "asked": "Looking to outsource the Admin data entry functions",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "9 Apr",
        "outcome": "Closed Lost"
      },
      {
        "date": "13 Apr",
        "name": "Andy McLeod",
        "company": "Shade Australia · Australia",
        "keyword": "3d animator for hire",
        "asked": "hello I'd like to talk with you about gettning around 600 visual renders done of our market umbrellas. On top of that, every render will need to show 6 different colours. Can you help me with this for a reasonable price?",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "16 Apr",
        "name": "Mike Crawley",
        "company": "NX Sports · Australia",
        "keyword": "outsourcing digital marketing services",
        "asked": "0402 226 333",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "19 Apr",
        "name": "Paul Lo",
        "company": "Spacel · Australia",
        "keyword": "outsourcing companies",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 Apr",
        "name": "Codie McDonald",
        "company": "SpaCraft Pty Ltd · Australia",
        "keyword": "3d animator for hire",
        "asked": "Hi Team!, I am wanting to get roughly 25-35 images rendered. These images are for our Chemical Products. I am just needing an Quote to see a rough estimate of cost.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "24 Apr",
        "name": "Katherine Calvert",
        "company": "Dr. Josh Mirmelli · United States",
        "keyword": "digital marketing specialist",
        "asked": "I'm searching for an independent SEO consultant for a private psychology practice located in Beverly Hills. A few things I would love to know about you: Have you worked with high-end wellness or mental health practices? Case studies or references would help Your typical engageme…",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Marketing nuture funnel"
      },
      {
        "date": "27 Apr",
        "name": "Daniel Jiang",
        "company": "bridge wealth international pty ltd · Australia",
        "keyword": "outsource financial",
        "asked": "hi i have been working in this industry for 7 years, im running my own business ,im looking for a new aggregator, prefer mandarin speaker BDM thanks",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "29 Apr",
        "outcome": "Closed Lost"
      },
      {
        "date": "28 Apr",
        "name": "Zoe Lehner",
        "company": "Elements ABC · Australia",
        "keyword": "offshore staffing",
        "asked": "Hello, we are looking to trial an offshore administration contractor. Is it possible to hire someone on a contract basis, or does it have to be full time?",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "May 2026",
    "summary": "16 leads · 7 quality · 9 booked · 0 clients",
    "leads": [
      {
        "date": "1 May",
        "name": "Freya",
        "company": "Mumshine · Australia",
        "keyword": "outsourcing digital marketing services",
        "asked": "Hi I am a small business looking for marketing support. Social Media content and posting (i provide the long form video and blog to be broken down into shorts, posts, carousels). Canva templates ready.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "7 May",
        "name": "(name field holds their message)",
        "company": "Marsill Pty · Australia",
        "keyword": "outsource app development",
        "asked": "Where are you based? Where are your workers from? What are the rates? Where do your workers, work from?",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "8 May",
        "name": "Tamsin Falconer",
        "company": "Avenue Events · Australia",
        "keyword": "overseas app developers",
        "asked": "Hi ADT Team! I am hoping you can assist me by scouting a web/platform developer who also has experience in app development as a secondary? I am building an expansive web platform for event planners which includes integrated 2D + 3D floor plan and site map building tools, seating…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "12 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "11 May",
        "name": "Allan Tasses",
        "company": "Boza Tasses Group · Australia",
        "keyword": "outsource web app development",
        "asked": "Digital Marketing",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "13 May",
        "name": "(name field holds their message)",
        "company": "auororapg.com.au · Australia",
        "keyword": "outsourcing graphic designers",
        "asked": "We are looking for somone to complete some indesign work from templates we already have - such as construction project profiles, staff CV's and tenderr submssion pages",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "14 May",
        "name": "Carlos Rodrigues",
        "company": "Provincial Upholstery · Australia",
        "keyword": "outsource website building",
        "asked": "urgent:%20Technical%20Server%20Takeover%20&%20IP%20Shield%20Implementation To the Technical Director,My name is Carlos Rodrigues, Master Upholsterer and Heritage Consultant for Government House Sydney and the National Trust. I am currently transitioning my practice, Provincial U…",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "18 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "15 May",
        "name": "Jennifer (jenn) Sanchez",
        "company": "Arctic Blue · Australia",
        "keyword": "dedicated shopify developer",
        "asked": "searching for an shopify dev expert, that also has experience integrated APIs with shopify, customasible products, dynamic pricing, thanks",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "18 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "19 May",
        "name": "Nicole Larter",
        "company": "Axima Pty Ltd · Australia",
        "keyword": "offshoring companies",
        "asked": "My colleague and I will be visiting Vietnam between the 8-10th June and would like to conduct a site visit. We have an existing outsourced centre in the Philippines that we are reviewing at the moment and are looking at alternatives.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "19 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 May",
        "name": "SOPHIE TOWNSEND",
        "company": "AAA OT · Australia",
        "keyword": "outsource web development",
        "asked": "We have been notified by Amazon that the nodes are changing and we need help to reconnect our api to a data base we currently have set up so it can talk to our CRM? Our forms have now stopped working.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "23 May",
        "name": "Tina",
        "company": "gmail.com · Australia",
        "keyword": "digital marketing outsourcing companies",
        "asked": "I am looking for an admin who can speak English (intermediate-fluent) and Vietnamese (fluently). We are looking for contract role to start with. Please send me the estimated cost.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "1 May",
        "name": "Kevin Herselman",
        "company": "JSL Energy Pty Ltd · Australia",
        "keyword": "data engineer",
        "asked": "We require 4 to 6 ribbon fibre engineers for a short term project to be deployed as soon as possible. Please call to discuss further details. Thank you.",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "1 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "15 May",
        "name": "Abigail Swain",
        "company": "Natures Way · Australia",
        "keyword": "content creation outsourcing",
        "asked": "I'm reaching out from the Nature's Way marketing team - we're kicking off an Amazon A+ Content project across a handful of our priority SKUs and looking for a designer to bring it to life. Quick context on the brief: - 10 hero SKUs to start (probiotic, turmeric, protein, fibre g…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "18 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "24 May",
        "name": "Alexander Austin",
        "company": "Personal Business · United States",
        "keyword": "ux outsourcing",
        "asked": "Redesign a SVOD app for animation.",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "5 Jun",
        "outcome": "Closed lost"
      },
      {
        "date": "26 May",
        "name": "Alain Blanar",
        "company": "ALLUCIA PTY LTD · Australia",
        "keyword": "overseas app developers",
        "asked": "can you fix my website www.splendidsilver.com.au",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "27 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "27 May",
        "name": "Annie Holden",
        "company": "The Travel Bra · Australia",
        "keyword": "dedicated shopify developer",
        "asked": "Hi there, I am looking for an ongoing tech support person that I can call on from time to time to help me with my website - to 1. trouble shoot my website, www.thetravelbra.com - not all images are showing up 2. integrate with paypal to automatically pay my affiliates 3. create…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "27 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "29 May",
        "name": "ANTHOULA KAFANTARIS",
        "company": "JAK’S SKINCARE · United States",
        "keyword": "outsource social media posting",
        "asked": "Hi, My name is Anthoula and I am currently building a new luxury skincare brand called JAK’S Skincare. I am looking for a long-term agency partner that can help with the full digital launch and growth of the brand, including: • Shopify website build and luxury design direction •…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed lost"
      }
    ]
  },
  {
    "label": "June 2026",
    "summary": "11 leads · 6 quality · 5 booked · 1 client",
    "leads": [
      {
        "date": "1 Jun",
        "name": "Ageliki Tsougranis",
        "company": "N/A · Australia",
        "keyword": "overseas app developers",
        "asked": "To whom it may concern, I'm still new to the app development process. I'm looking into what it takes to develop a new iOS app for women's safety while exercising at night. Could you please outline the typical roles included in an app development team for a project like this? Wha…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "1 Jun",
        "name": "Mikyo M",
        "company": "Seventeen.Digital Marketing · Australia",
        "keyword": "3d animator for hire",
        "asked": "Hi team, We've got a client that works in AI apps and they've got a new product launching soon. They're after some promotional videos - no filming needed, animations only. We already have 3 samples and just need a quote from you guys. Please get back to me ASAP as it's a bit urg…",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "2 Jun",
        "name": "simon smith",
        "company": "King iskland Lodge · Australia",
        "keyword": "marketing outsourcing companies",
        "asked": "I'm looking for social media strategies to help us with our travel business. Thanks.",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "12 Jun",
        "name": "chris Donlon",
        "company": "Cadie · Australia",
        "keyword": "hire ai developers",
        "asked": "no",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "15 Jun",
        "outcome": "Closed Lost"
      },
      {
        "date": "12 Jun",
        "name": "Melanie",
        "company": "Guide Healthcare · Australia",
        "keyword": "outsource social media",
        "asked": "I'd like to learn more about graphic design support for social media posts",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "25 Jun",
        "name": "Elias",
        "company": "SyncSuite · Antigua and Barbuda",
        "keyword": "how can i develop an app",
        "asked": "I want to make a mobile app",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Junk/spam"
      },
      {
        "date": "26 Jun",
        "name": "Tarah",
        "company": "Evolve BJJ · Australia",
        "keyword": "virtual assistant outsourcing",
        "asked": "I’m looking for a virtual assistant / salesperson. For new leads, booking trials, sales and updating our pipeline.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Lead"
      },
      {
        "date": "26 Jun",
        "name": "Tara Nguyen",
        "company": "Frena studio · United States",
        "keyword": "vietnam social media marketing",
        "asked": "Hi I’m looking for marketing/ content creator/ and social media manager for my upcoming brand",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "27 Jun",
        "outcome": "Closed lost"
      },
      {
        "date": "27 Jun",
        "name": "Reena Shah",
        "company": "Compliance Plus · Australia",
        "keyword": "staffing agency vietnam",
        "asked": "Hi. We are looking to appoint a Vietnam based staff / contractor and ideally in Danang area and role is admin but legal compliance admin so ideal candidate would need to have some legal / financial services background.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "1 Jul",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "30 Jun",
        "name": "Cindy Lieu",
        "company": "Save Our Service - Childcare Recruitment Agency · Australia",
        "keyword": "app development vietnam outsourcing",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "3 Jul",
        "outcome": "Closed Lost"
      },
      {
        "date": "4 Jun",
        "name": "Mario Khattar",
        "company": "Get Cultured · Australia",
        "keyword": "offshore outsourcing",
        "asked": "Hi i'd like to understand and learn more about your pricing structure and service offering. Looking to outsource a Graphic Designer and Web Designer.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "9 Jun",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "July 2026",
    "summary": "6 leads · 5 quality · 5 booked · 1 client",
    "leads": [
      {
        "date": "1 Jul",
        "name": "Joanne Elliott",
        "company": "Growth Factor Accountants · Australia",
        "keyword": "vietnam outsource",
        "asked": "I am after an experienced management accountant",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "6 Jul",
        "outcome": "Sales Qualified Lead"
      },
      {
        "date": "8 Jul",
        "name": "Laurence Dam",
        "company": "Universal Pharmacuticlas Pty Ltd · Australia",
        "keyword": "vietnam marketing agency",
        "asked": "digital marketing team to promoting product awareness, and branding on social media - instagram, facebook, and youtube",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "9 Jul, 21 Jul",
        "outcome": "Closed Lost"
      },
      {
        "date": "15 Jul",
        "name": "Rui Liu",
        "company": "Powerflex · United States",
        "keyword": "offshore bookkeeping services",
        "asked": "Bookkeeping support",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "17 Jul",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "20 Jul",
        "name": "Sven Felius",
        "company": "Northern Consulting Engineers · Australia",
        "keyword": "offshore vietnam developers",
        "asked": "looking for options a hiring an offshore computational designer in Vietnam",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "28 Jul",
        "name": "Georgina Murison",
        "company": "National Estimation & project management · Australia",
        "keyword": "outsource admin",
        "asked": "Looking for administrator to assist with bookkeeping, collection of accounts, client correspondence & overall office duties along with submission creations to clients- data entry.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "28 Jul",
        "outcome": "Closed Lost"
      },
      {
        "date": "8 Jul",
        "name": "Shweta Mithsagar",
        "company": "Aditi UVG · Australia",
        "keyword": "outsource vietnam",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "10 Jul, 23 Jul",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "August 2026",
    "summary": "12 leads · 4 quality · 4 booked · 3 clients",
    "leads": [
      {
        "date": "6 Aug",
        "name": "Kevin Cheong",
        "company": "Winho Trading · Australia",
        "keyword": "outsource vietnam",
        "asked": "Hi, I'm looking for a VA. Book keeping and senior accounting role. Full time. If someone could call to discuss, thanks",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "7 Aug",
        "outcome": "Became a clientSigned; not yet marked won in HubSpot"
      },
      {
        "date": "11 Aug",
        "name": "Nathan Young",
        "company": "Heyday Venues · Australia",
        "keyword": "business process outsourcing companies",
        "asked": "Hello, we have a freelance bookkeeper from the Philippines who is looking to come fulltime with our company at $10usd per hour, I wondering if this is something you can facilitate?",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "21 Aug",
        "name": "Richard Perrin",
        "company": "Airconditioning Wholesale · Australia",
        "keyword": "outsource shopify developer",
        "asked": "Looking for Shopify web re-development",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 Aug",
        "name": "Can you Call",
        "company": "gmail.com · United States",
        "keyword": "overseas outsourcing",
        "asked": "No",
        "gradeKey": "neutral",
        "grade": "Not enough detail",
        "meeting": "-",
        "outcome": "Junk/spam"
      },
      {
        "date": "24 Aug",
        "name": "John Clayton Clayton",
        "company": "gmail.com · United States",
        "keyword": "offshore staffing",
        "asked": "No message",
        "gradeKey": "poorlite",
        "grade": "Poor: personal email, no message",
        "meeting": "-",
        "outcome": "In progress"
      },
      {
        "date": "24 Aug",
        "name": "Leith Johnston",
        "company": "Erinfair Pty Ltd t/a Bunbury Farmers Market · Australia",
        "keyword": "staffing agency offshore",
        "asked": "Intent: Exploring fit and where to start? Roles: Other People Roles to fill: 1-3 Hiring timeline: Immediately Outsourced before: Yes",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "27 Aug",
        "outcome": "Became a clientSigned; not yet marked won in HubSpot"
      },
      {
        "date": "24 Aug",
        "name": "Derek Henry",
        "company": "Quest St Kilda · Australia",
        "keyword": "offshore bookkeeping",
        "asked": "Need to explore bookkeeping and accounting support",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "27 Aug",
        "outcome": "Became a client"
      },
      {
        "date": "25 Aug",
        "name": "Stavro tobia",
        "company": "Strava group · Australia",
        "keyword": "outsource seo specialist",
        "asked": "Intent: Ready to grow: 15-minute call",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "26 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "26 Aug",
        "name": "Charles Lyle Lyle",
        "company": "gmail.com · United States",
        "keyword": "offshore staffing",
        "asked": "No message",
        "gradeKey": "poorlite",
        "grade": "Poor: personal email, no message",
        "meeting": "-",
        "outcome": "Junk/spam"
      },
      {
        "date": "27 Aug",
        "name": "dgdfg",
        "company": "dfgdffgd · -",
        "keyword": "outsourcing companies",
        "asked": "No message",
        "gradeKey": "weak",
        "grade": "Poor: wrong service or spam",
        "meeting": "-",
        "outcome": "Junk/spam"
      },
      {
        "date": "31 Aug",
        "name": "Stuart",
        "company": "acp trades · -",
        "keyword": "recruiter vietnam",
        "asked": "what is your fee",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Junk/spam"
      },
      {
        "date": "18 Aug",
        "name": "Vinay Singh",
        "company": "Bookeeper · Australia",
        "keyword": "outsourced bookkeeper",
        "asked": "We are looking for a Bookkeeper",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      }
    ]
  },
  {
    "label": "September 2026",
    "summary": "4 leads · 3 quality · 2 booked · 0 clients",
    "leads": [
      {
        "date": "17 Sep",
        "name": "Aaron",
        "company": "Colli · Australia",
        "keyword": "vietnam outsourcing company",
        "asked": "Intent: Exploring fit and where to start? Roles: Admin People, Customer Service People Roles to fill: 1-3 Hiring timeline: 1 - 3 Months Outsourced before: No",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "17 Sep",
        "outcome": "Lead - Awaiting Contact"
      },
      {
        "date": "18 Sep",
        "name": "Grant Rigby",
        "company": "Full Stack Financial · United States",
        "keyword": "outsourcing staff",
        "asked": "Intent: Exploring fit and where to start? Roles: Customer Service People Roles to fill: 1-3 Hiring timeline: 3 - 6 Months Outsourced before: No",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "19 Sep, 22 Sep",
        "outcome": "Awaiting contact"
      },
      {
        "date": "25 Sep",
        "name": "Rahma Rahma",
        "company": "ABC · Australia",
        "keyword": "outsourced bookkeeping services",
        "asked": "Intent: Exploring fit and where to start? Roles: Finance People, Admin People, Customer Service People Roles to fill: 4-6 Hiring timeline: 1 - 3 Months Outsourced before: Yes",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Lead - Awaiting Contact"
      },
      {
        "date": "26 Sep",
        "name": "Leah Nguyen",
        "company": "gmail.com · -",
        "keyword": "outsourced bookkeeper",
        "asked": "No message",
        "gradeKey": "poorlite",
        "grade": "Poor: personal email, no message",
        "meeting": "-",
        "outcome": "Lead"
      }
    ]
  },
  {
    "label": "October 2026 so far (after the review period)",
    "summary": "1 lead · 1 quality · 1 booked · not counted in the totals above",
    "leads": [
      {
        "date": "4 Oct",
        "name": "Justin Duddek",
        "company": "iclud.com · United States",
        "keyword": "outsource mobile app development",
        "asked": "Intent: Exploring fit and where to start? Roles: Digital Marketing People, Tech People, Admin People, Customer Service People, Other People Roles to fill: 1-3 Hiring timeline: Immediately Outsourced before: Yes",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "8 Oct",
        "outcome": "Awaiting contact"
      }
    ]
  },
  {
    "label": "Searched for Away by name (not counted above)",
    "summary": "9 leads whose search was Away’s own name, so the ad didn’t find them",
    "leads": [
      {
        "date": "16 Jul",
        "name": "Valentin Utech",
        "company": "BFT · Australia",
        "keyword": "away teams",
        "asked": "Hey guys, Just spoke with Liam from the Accent Group. He mentioned he is in discussions with you or might have already come on board for their Performance Marketing. I am looking to find out a bit more about how you guys work and what's involved, KPIs, etc. I am looking to hire…",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "17 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "12 Aug",
        "name": "Esad Skalic",
        "company": "Mizuho · Australia",
        "keyword": "away digital teams",
        "asked": "Hi, .Net code uplift, AzureDevops plus AI modernisation. Thanks",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "13 Aug",
        "outcome": "Closed Lost"
      },
      {
        "date": "23 Sep",
        "name": "Rosie Higgins",
        "company": "Halcol Energy · Australia",
        "keyword": "away digital teams",
        "asked": "Hello looking to outsource duties to one staff member",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "2 Oct",
        "outcome": "Became a clientwon deal"
      },
      {
        "date": "7 Jan",
        "name": "Dinesh Perera",
        "company": "Mulgrave Dental Group · Australia",
        "keyword": "away digital teams",
        "asked": "Need to fill this role urgently.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "12 Jan",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 Apr",
        "name": "Kellie Ellis",
        "company": "Chronic Pain Australia · Australia",
        "keyword": "away digital team",
        "asked": "We're looking for an offshore Content Creator / Marketing Specialist to hire 20 hours per week",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "7 Jul",
        "name": "Daniel Hall",
        "company": "Make Beer PL · Australia",
        "keyword": "away digital teams",
        "asked": "Hello. I'm looking to move my accounting and bookkeeping services to an offshore provider. Please get in touch to discuss my requirements. I look forward to hearing from you soon. Dan",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "8 Jul",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "23 Feb",
        "name": "Bryce Matthews",
        "company": "Torilla Technologies Pty Ltd · Australia",
        "keyword": "away digital teams",
        "asked": "Hello, I am looking to hire 3 - 4 technical staff from Vietnam, to assist my company and software we currently have and support. English language is a must: 1 Product owner/BA 2 Mid level developers 1 senior developer Regards, Bryce",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "26 Feb",
        "outcome": "Closed Lost"
      },
      {
        "date": "23 Apr",
        "name": "Brooke Fowler",
        "company": "Tank Stream Design · Australia",
        "keyword": "away digital team",
        "asked": "We are looking for a team to deliver seasonal catalogues and sales tools so we can move these jobs out of our internal marketing department.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "29 Apr, 4 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "16 Jul",
        "name": "Alistair Buchanan",
        "company": "CAPTURELAB · Australia",
        "keyword": "away digital teams",
        "asked": "I am wanting to hire 1 to 2 full-time creative retouchers with 5 plus years experience.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "21 Jul",
        "outcome": "Active recruitment"
      }
    ]
  },
  {
    "label": "Paid search assisted (not counted above)",
    "summary": "12 leads that first arrived another way but also came through paid search",
    "leads": [
      {
        "date": "11 Sep",
        "name": "Sam Sit",
        "company": "Fingo · -",
        "keyword": "-",
        "asked": "the off shoring staff/team that you hire our your clients' behave, do they work from your dedicated office in Vietname or do they work from home or remotely?",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Plant a seed"
      },
      {
        "date": "30 Sep",
        "name": "Mark Amin",
        "company": "Potter and Sower · Australia",
        "keyword": "-",
        "asked": "Looking for a marketing assistant",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "16 Mar",
        "outcome": "Closed Lost"
      },
      {
        "date": "8 Oct",
        "name": "Ian Slater",
        "company": "PerformancePRO · Australia",
        "keyword": "-",
        "asked": "Hi What are standard rates for a customer service and BDM on phone role, driving new business inquiries and lead generation? Thanks Ian",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "22 Oct",
        "name": "Kimy Doan",
        "company": "gmail.com · United States",
        "keyword": "-",
        "asked": "I just recently open a pickleball and badminton facility in Houston. I would like to learn more about your company how you can help me with digital marketing.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "22 Oct, 24 Oct",
        "outcome": "Closed lost"
      },
      {
        "date": "27 Oct",
        "name": "Amber Balart",
        "company": "Heathwood Hydraulic · Australia",
        "keyword": "-",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "27 Oct",
        "outcome": "Marketing Nurture Funnel"
      },
      {
        "date": "27 Nov",
        "name": "LEONID SHENDELMAN",
        "company": "magicplatestand.com · United States",
        "keyword": "-",
        "asked": "No message",
        "gradeKey": "lowbiz",
        "grade": "Low quality: real business, little detail",
        "meeting": "-",
        "outcome": "Send back to marketing for nurture"
      },
      {
        "date": "10 Dec",
        "name": "Craig Smith",
        "company": "Dynasty Sport · Australia",
        "keyword": "-",
        "asked": "Hi, We are exploring options for our artwork requirements. Logo redraw, concept art, order graphics (cad). We have internal teams and established processes that require scale. Is this something that you provide? Cheers? Craig",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "1 Jan",
        "name": "John Dooley",
        "company": "Adcom Media Productions · Australia",
        "keyword": "-",
        "asked": "I need to produce a package of 3D rendered TV station IDs, News bulletin headline teaser, news opener, weather sting intro, Footy show opener and animated results graphics etc. Kind regards John Dooley 0404475687",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Closed Lost"
      },
      {
        "date": "9 Jan",
        "name": "Ray Ghamous",
        "company": "EPIQORE · United States",
        "keyword": "-",
        "asked": "Looking to expand our team but would like to start with a part time contractor for cold calling and emailing",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "2 Apr",
        "outcome": "Closed lost"
      },
      {
        "date": "11 Feb",
        "name": "Hi team,",
        "company": "gmail.com · Australia",
        "keyword": "-",
        "asked": "Im looking for someone doing social media and website",
        "gradeKey": "mixed",
        "grade": "One-off or short-term project",
        "meeting": "-",
        "outcome": "Contact Pending - Unresponsive"
      },
      {
        "date": "30 Apr",
        "name": "Anne Hurley",
        "company": "James&Co · Australia",
        "keyword": "-",
        "asked": "I want to outsource sales & marketing of the business. Have developed products with growth markets, outsourced warehouse & fulfilment, B2B, lots of research into markets (there are many) and want to kick it out. I can't do sales & marketing.",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "1 May",
        "outcome": "Closed Lost"
      },
      {
        "date": "3 May",
        "name": "Danny Makhoul",
        "company": "Run Better Consulting · Australia",
        "keyword": "GOOGLE",
        "asked": "Hi team, Currently in the market for a virtual assistant - someone of high calibre with proficiency in general admin, research, strong verbal and written communication. Can you please reach out to organise a time to chat. Thanks Danny",
        "gradeKey": "strong",
        "grade": "Quality",
        "meeting": "-",
        "outcome": "Closed Lost"
      }
    ]
  }
]

export type LandingPagePreview = {
  readonly slug: string
  readonly label: string
  readonly title: string
  readonly url: string
}

/**
 * Landing pages generated on the hire.awaydigitalteams.com subdomain.
 * TOTAL is the count in the landing build's lp/pages.json manifest; the four
 * previews below are representative pages (AU market) shown as live iframes.
 */
export const LANDING_PAGES_TOTAL = 98

export type ChannelRow = {
  readonly channel: string
  readonly sessions: string
  readonly conversions: string
  readonly cvr: string
}

// Digital channel performance (GA4): where traffic comes from and how each
// channel converts. Period: July 2025 to September 2026.
export const CHANNEL_PERIOD = 'July 2025 to September 2026'

export const CHANNEL_ROWS: readonly ChannelRow[] = [
  { channel: 'Direct', sessions: '19,491', conversions: '144', cvr: '0.74%' },
  { channel: 'Paid Search', sessions: '18,598', conversions: '217', cvr: '1.17%' },
  { channel: 'Paid Social', sessions: '14,384', conversions: '5', cvr: '0.03%' },
  { channel: 'Organic Search', sessions: '10,475', conversions: '81', cvr: '0.77%' },
  { channel: 'Cross-network', sessions: '7,281', conversions: '45', cvr: '0.62%' },
  { channel: 'Referral', sessions: '3,570', conversions: '57', cvr: '1.60%' },
  { channel: 'Organic Social', sessions: '1,456', conversions: '6', cvr: '0.41%' },
  { channel: 'Paid Other', sessions: '460', conversions: '0', cvr: '0.00%' },
  { channel: 'Email', sessions: '284', conversions: '4', cvr: '1.41%' },
  { channel: 'AI Assistant', sessions: '193', conversions: '6', cvr: '3.11%' },
  { channel: 'Display / Organic Shopping / Paid Video / Organic Video', sessions: '163', conversions: '0', cvr: '0.00%' },
  { channel: 'Total', sessions: '76,355', conversions: '565', cvr: '0.74%' },
]

export const NEGATIVE_KEYWORDS = {
  totalLists: '15',
  activeLists: '15',
  totalKeywords: '9,442',
}

export const LANDING_PAGE_PREVIEWS: readonly LandingPagePreview[] = [
  {
    slug: 'offshore-outsourcing-au',
    label: 'Offshore outsourcing',
    title: 'Offshore Outsourcing to Vietnam',
    url: 'https://hire.awaydigitalteams.com/offshore-outsourcing-au',
  },
  {
    slug: 'back-end-developer-vietnam-au',
    label: 'Hire a back-end developer',
    title: 'Hire a back-end developer in Vietnam',
    url: 'https://hire.awaydigitalteams.com/back-end-developer-vietnam-au',
  },
  {
    slug: 'bookkeeper-vietnam-au',
    label: 'Hire a bookkeeper',
    title: 'Hire a bookkeeper in Vietnam',
    url: 'https://hire.awaydigitalteams.com/bookkeeper-vietnam-au',
  },
  {
    slug: 'accountant-vietnam-au',
    label: 'Hire an accountant',
    title: 'Hire an accountant in Vietnam',
    url: 'https://hire.awaydigitalteams.com/accountant-vietnam-au',
  },
]
