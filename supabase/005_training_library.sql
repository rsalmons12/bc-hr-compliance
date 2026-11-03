-- BC HR & Compliance portal: starter training library (run AFTER 004_training.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Running it again skips
-- modules that already exist.
--
-- Creates 17 modules for ALL agencies, each with a draft lesson and a 5-question quiz.
-- They are created INACTIVE: review and edit each one in the portal (Training -> module),
-- then tick "Active" so employees can take it. The lessons are general starting points;
-- check them against your state rules and each agency's policies before use.
-- Renewal is set to every year and the pass mark to 80%.

do $seed$
declare
  library jsonb := $library$[
 {
  "title": "Patient Rights",
  "description": "The rights every person in our care has, and how staff protect them.",
  "content": "Every person we serve has rights that staff must know, explain and protect.\n\nCore patient rights include:\n- To be treated with dignity and respect, free from abuse, neglect, exploitation and discrimination.\n- To privacy and confidentiality of their information.\n- To be informed about their treatment, including risks, benefits and alternatives, and to give or refuse informed consent.\n- To take part in developing their own treatment plan.\n- To refuse treatment, except where the law provides otherwise.\n- To access their own records, as permitted by law and policy.\n- To be free from restraint or seclusion used for discipline or staff convenience.\n- To voice complaints and file grievances without retaliation, and to be told how to contact the state licensing agency.\n\nRights are explained at admission, posted where patients can see them, and acknowledged in writing.\n\nWhat staff must do:\n- Explain rights in language the person understands, using an interpreter when needed.\n- Never discourage or punish someone for complaining.\n- Report any suspected rights violation to your supervisor right away.\n- If a right is restricted for clinical or safety reasons, document the reason and have it reviewed according to policy.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "When are patients told about their rights?",
    "o": [
     "Only if they ask",
     "At discharge",
     "Only when they file a complaint",
     "At admission, with rights posted and acknowledged in writing"
    ],
    "a": 3
   },
   {
    "q": "A patient wants to file a grievance about a staff member. What should you do?",
    "o": [
     "Tell them it may affect their treatment",
     "Talk them out of it",
     "Ignore it if the complaint seems minor",
     "Explain the grievance process and support them, without retaliation"
    ],
    "a": 3
   },
   {
    "q": "Which of these is a patient right?",
    "o": [
     "To refuse treatment, except where the law provides otherwise",
     "To read other patients' records",
     "To be restrained when staff are short-handed",
     "To choose which staff are disciplined"
    ],
    "a": 0
   },
   {
    "q": "Restraint or seclusion may be used:",
    "o": [
     "Never for discipline or convenience; only as allowed by law and policy for safety",
     "As punishment for breaking rules",
     "Whenever a patient refuses medication",
     "For staff convenience"
    ],
    "a": 0
   },
   {
    "q": "A patient does not speak English well. How should their rights be explained?",
    "o": [
     "Skip the explanation",
     "Use an interpreter or materials in a language they understand",
     "Give them the English form to sign",
     "Ask another patient to translate"
    ],
    "a": 1
   }
  ]
 },
 {
  "title": "HIPAA Privacy and Security",
  "description": "Protecting patients' health information under HIPAA.",
  "content": "HIPAA is the federal law that protects patients' health information.\n\nProtected health information (PHI) is any information that identifies a person and relates to their health, their care or payment for their care. Names, dates of birth, addresses, phone numbers, photos and record numbers all count when linked to care.\n\nKey rules:\n- Minimum necessary: use, view and share only the information you need to do your job.\n- Do not look at records out of curiosity, including records of family, friends, co-workers or yourself, unless your job requires it.\n- Patients have the right to see and get copies of their records, and to ask for corrections.\n- Disclosures outside treatment, payment and health care operations generally need the patient's written authorization unless the law allows otherwise.\n\nSecurity safeguards:\n- Lock your screen when you step away. Never share passwords.\n- Do not send PHI by personal email or text. Use approved, secure systems.\n- Keep paper records out of public view and shred them; never put them in the trash.\n- Report lost or stolen devices immediately.\n\nBreaches: report any suspected privacy or security incident to the Privacy Officer right away. Affected individuals must be notified of a breach of unsecured PHI without unreasonable delay and no later than 60 days after it is discovered, so fast reporting matters.\n\nViolations can lead to discipline, termination, civil penalties and, in some cases, criminal charges.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "Which of these is protected health information (PHI)?",
    "o": [
     "Public health statistics with no identifiers",
     "A patient's name together with their appointment date",
     "The agency's street address",
     "A blank intake form"
    ],
    "a": 1
   },
   {
    "q": "\"Minimum necessary\" means:",
    "o": [
     "Share as much as possible to be safe",
     "Use and share only the information needed to do your job",
     "Only doctors can view records",
     "Records can be shared with anyone on staff"
    ],
    "a": 1
   },
   {
    "q": "You are curious about a co-worker's diagnosis and have system access. Can you look?",
    "o": [
     "Yes, if you don't tell anyone",
     "No, not unless your job requires it",
     "Yes, if the co-worker is a friend",
     "Yes, because you are staff"
    ],
    "a": 1
   },
   {
    "q": "You think a laptop with patient information was stolen. What do you do?",
    "o": [
     "Change your password and say nothing",
     "Report it to the Privacy Officer immediately",
     "Tell patients yourself",
     "Wait to see if it turns up"
    ],
    "a": 1
   },
   {
    "q": "How should paper records with PHI be thrown away?",
    "o": [
     "Taken home to dispose of",
     "Shredded or placed in a secure shred bin",
     "In the regular trash",
     "In the recycling bin"
    ],
    "a": 1
   }
  ]
 },
 {
  "title": "42 CFR Part 2: Substance Use Disorder Records",
  "description": "Federal confidentiality rules for substance use disorder treatment records.",
  "content": "42 CFR Part 2 is a federal regulation that protects the confidentiality of substance use disorder (SUD) patient records kept by federally assisted SUD programs. In several ways it is stricter than HIPAA.\n\nWhy it exists: people may avoid treatment if they fear their records will be used against them, for example in criminal cases, employment or custody matters.\n\nKey rules:\n- Even confirming that someone is, or was, a patient can be a disclosure. If someone asks whether a person is here, do not confirm or deny unless the patient has consented.\n- Most disclosures require the patient's written consent that meets Part 2 requirements. Under the 2024 update, a patient may give a single consent for future uses for treatment, payment and health care operations.\n- Records generally cannot be used to investigate or prosecute the patient, or in civil, criminal or administrative proceedings against them, without the patient's consent or a special court order.\n- Limited exceptions allow disclosure without consent, including bona fide medical emergencies, certain research and audits, reports of suspected child abuse or neglect required by state law, and crimes on program premises or against program staff.\n- Information disclosed with consent must carry the required notice about redisclosure.\n\nWhat staff must do:\n- Check for a valid consent before sharing anything. If unsure, ask your supervisor or the Privacy Officer.\n- Treat subpoenas, police requests and calls from family with care: do not disclose without checking.\n- Report any unauthorized disclosure right away.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "A caller asks whether John Smith is a patient. With no consent on file, you should:",
    "o": [
     "Transfer the call to his counselor",
     "Give his room number",
     "Neither confirm nor deny that he is a patient",
     "Confirm he is a patient but give no other details"
    ],
    "a": 2
   },
   {
    "q": "Compared with HIPAA, Part 2 protections for SUD records are generally:",
    "o": [
     "The same",
     "Stricter in several ways",
     "Only for paper records",
     "Weaker"
    ],
    "a": 1
   },
   {
    "q": "A police officer asks for a patient's records, with no consent or court order. What should you do?",
    "o": [
     "Read the records aloud instead",
     "Hand over the records",
     "Give a summary only",
     "Do not disclose; refer the request to your supervisor or Privacy Officer"
    ],
    "a": 3
   },
   {
    "q": "Which is an exception that allows disclosure without consent?",
    "o": [
     "A friend asking how the patient is doing",
     "A bona fide medical emergency",
     "A landlord checking references",
     "A request from the patient's employer"
    ],
    "a": 1
   },
   {
    "q": "Under the 2024 update to Part 2, a patient may:",
    "o": [
     "Never consent to any disclosure",
     "Consent on behalf of other patients",
     "Give a single consent for future uses for treatment, payment and health care operations",
     "Only consent verbally"
    ],
    "a": 2
   }
  ]
 },
 {
  "title": "Confidentiality in Daily Practice",
  "description": "Keeping patient information private in everyday work.",
  "content": "Confidentiality is part of every task, not only the medical record.\n\nEveryday practices:\n- Discuss patients only with people who need to know for their care or work, and only in private areas. Avoid hallways, elevators, lobbies and break rooms.\n- Never post about patients on social media, even without names. Do not \"friend\" or follow patients.\n- Do not take photos or videos in program areas unless policy allows it.\n- Keep records, schedules and whiteboards out of public view. Log off or lock screens when you leave a workstation.\n- Verify a caller's identity and authorization before giving any information.\n- Use only approved, secure systems for messages and files.\n\nIf you see a patient in public, let them decide whether to acknowledge you. Do not greet them in a way that reveals they receive services.\n\nYour duty of confidentiality continues after your employment ends.\n\nReport any breach, including your own mistakes, right away. Early reporting limits harm.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "Where is it appropriate to discuss a patient's care with a colleague who needs to know?",
    "o": [
     "In the waiting room",
     "In the elevator",
     "At a restaurant after work",
     "In a private area"
    ],
    "a": 3
   },
   {
    "q": "You see a patient at the grocery store. You should:",
    "o": [
     "Greet them by name and ask how treatment is going",
     "Tell your friend who they are",
     "Take a photo",
     "Let them decide whether to acknowledge you"
    ],
    "a": 3
   },
   {
    "q": "Posting about a funny patient interaction on social media without names is:",
    "o": [
     "Fine if no names are used",
     "Fine on a private account",
     "Allowed with a supervisor's verbal OK",
     "Not allowed"
    ],
    "a": 3
   },
   {
    "q": "Your duty of confidentiality after you leave the job:",
    "o": [
     "Continues",
     "Only applies to managers",
     "Ends after one year",
     "Ends on your last day"
    ],
    "a": 0
   },
   {
    "q": "You accidentally emailed a patient document to the wrong person. What now?",
    "o": [
     "Wait to see if anyone complains",
     "Report it right away so it can be handled",
     "Ask the recipient to ignore it and tell no one",
     "Delete it from your sent folder and move on"
    ],
    "a": 1
   }
  ]
 },
 {
  "title": "Infection Prevention and Control",
  "description": "Standard precautions, hand hygiene and stopping the spread of infection.",
  "content": "Infection prevention protects patients, staff and visitors.\n\nStandard precautions apply to every patient, every time, whether or not an infection is known:\n- Hand hygiene: wash with soap and water for at least 20 seconds, or use an alcohol-based hand rub with at least 60% alcohol. Use soap and water when hands are visibly soiled.\n- Clean your hands before and after patient contact, after touching blood or body fluids, after removing gloves, before eating and after using the restroom.\n- Use personal protective equipment (gloves, gown, mask, eye protection) when you may contact blood, body fluids, broken skin or mucous membranes.\n- Respiratory etiquette: cover coughs and sneezes, offer masks to people with respiratory symptoms, and keep distance when possible.\n- Handle sharps safely: never recap needles; use sharps containers.\n- Clean and disinfect shared equipment and high-touch surfaces regularly.\n\nBloodborne exposure: if you are stuck by a needle or splashed with blood, wash the area immediately and report it at once so follow-up care can start quickly.\n\nStay home when you are sick with fever, vomiting, diarrhea or a contagious illness, and follow policy for returning to work.\n\nReport suspected outbreaks or clusters of illness to your supervisor or infection control lead.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "Standard precautions apply to:",
    "o": [
     "Only during flu season",
     "Only patients with a known infection",
     "Only patients with symptoms",
     "All patients, every time"
    ],
    "a": 3
   },
   {
    "q": "How long should you scrub with soap and water?",
    "o": [
     "Until the water runs hot",
     "Exactly 1 minute",
     "5 seconds",
     "At least 20 seconds"
    ],
    "a": 3
   },
   {
    "q": "Alcohol-based hand rub should contain at least:",
    "o": [
     "60% alcohol",
     "40% alcohol",
     "20% alcohol",
     "Any amount"
    ],
    "a": 0
   },
   {
    "q": "After a needlestick, you should first:",
    "o": [
     "Wash the area and report the exposure immediately",
     "Wait to see if you get sick",
     "Put on a bandage and say nothing",
     "Finish your task"
    ],
    "a": 0
   },
   {
    "q": "A used needle should be:",
    "o": [
     "Placed directly in a sharps container without recapping",
     "Bent before disposal",
     "Left on the tray for housekeeping",
     "Recapped, then thrown in the trash"
    ],
    "a": 0
   }
  ]
 },
 {
  "title": "Emergency Preparedness",
  "description": "Your role in the agency's emergency plan.",
  "content": "Emergencies such as severe weather, power outages, floods, medical emergencies, violence and pandemics can happen with little warning. The agency's emergency preparedness plan tells everyone what to do.\n\nKnow before an emergency:\n- Where the emergency plan is kept, and your role in it.\n- Evacuation routes, exits, assembly points and where emergency supplies are kept.\n- How to reach your supervisor and the emergency contact list.\n- How the agency will account for every patient and staff member.\n\nDuring an emergency:\n- Stay calm and follow instructions from the person in charge.\n- Protect life first: patients, visitors, co-workers and yourself.\n- Know the difference between evacuating (leaving the building) and sheltering in place (staying inside in a safe area, for example during a tornado or an outside threat).\n- Account for all patients and staff at the assembly point and report anyone missing.\n- Call 911 for life-threatening situations.\n- Bring essential information and medications when evacuating, if it is safe to do so.\n\nAfter an emergency: take part in the debrief and report problems so the plan can be improved. Participate in drills and exercises; practice is what makes the plan work.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "During a tornado warning, the agency will most likely:",
    "o": [
     "Ignore it unless the power goes out",
     "Send everyone home",
     "Shelter in place in a safe interior area",
     "Evacuate to the parking lot"
    ],
    "a": 2
   },
   {
    "q": "In any emergency, the first priority is:",
    "o": [
     "Protecting records",
     "Calling the newspaper",
     "Protecting equipment",
     "Protecting life"
    ],
    "a": 3
   },
   {
    "q": "At the assembly point after an evacuation you should:",
    "o": [
     "Help account for all patients and staff and report anyone missing",
     "Go back inside for your belongings",
     "Wait in your car",
     "Leave once you are outside"
    ],
    "a": 0
   },
   {
    "q": "Why does the agency hold emergency drills?",
    "o": [
     "So staff know their roles and the plan works when needed",
     "They are optional",
     "To test the alarm volume",
     "To meet paperwork only"
    ],
    "a": 0
   },
   {
    "q": "You do not know your role in the emergency plan. What should you do?",
    "o": [
     "Wait until an emergency happens",
     "Assume someone else will handle it",
     "Look it up online",
     "Ask your supervisor and review the plan now"
    ],
    "a": 3
   }
  ]
 },
 {
  "title": "Fire and Safety Procedures",
  "description": "RACE, PASS and keeping the workplace safe.",
  "content": "Fire safety is everyone's job.\n\nPrevent fires:\n- Keep exits, hallways and fire doors clear. Never prop fire doors open.\n- Report damaged cords, overloaded outlets and blocked sprinklers.\n- Follow the smoking and space heater policies.\n- Know where pull stations, extinguishers and exits are in your work area.\n\nIf there is a fire, remember RACE:\n- R: Rescue anyone in immediate danger, if it is safe to do so.\n- A: Alarm. Pull the fire alarm and call 911.\n- C: Contain the fire by closing doors.\n- E: Extinguish the fire if it is small and you are trained, or Evacuate.\n\nTo use a fire extinguisher, remember PASS:\n- P: Pull the pin.\n- A: Aim at the base of the fire.\n- S: Squeeze the handle.\n- S: Sweep from side to side.\n\nNever use elevators during a fire. If there is smoke, stay low. Feel doors with the back of your hand before opening; do not open a hot door.\n\nGeneral safety: report hazards such as wet floors, broken equipment and aggressive behavior right away, and follow the workplace violence prevention policy.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "In RACE, what does the \"A\" stand for?",
    "o": [
     "Alarm",
     "Answer",
     "Assess",
     "Avoid"
    ],
    "a": 0
   },
   {
    "q": "When using a fire extinguisher, you aim at:",
    "o": [
     "The ceiling",
     "The smoke",
     "The base of the fire",
     "The top of the flames"
    ],
    "a": 2
   },
   {
    "q": "During a fire you should:",
    "o": [
     "Prop fire doors open for air",
     "Wait for instructions at your desk",
     "Use the stairs, never the elevator",
     "Use the elevator to evacuate quickly"
    ],
    "a": 2
   },
   {
    "q": "A door feels hot when you touch it with the back of your hand. You should:",
    "o": [
     "Open it slowly",
     "Not open it, and use another route",
     "Kick it open",
     "Open it quickly"
    ],
    "a": 1
   },
   {
    "q": "What should you do with a fire door that keeps getting propped open?",
    "o": [
     "Close it and report the issue",
     "Remove the door closer",
     "Leave it, for convenience",
     "Tape it open"
    ],
    "a": 0
   }
  ]
 },
 {
  "title": "Incident Reporting",
  "description": "What to report, when, and how.",
  "content": "Incident reports help the agency keep people safe and improve care. Reporting is not about blame.\n\nReport any event that harmed, or could have harmed, a patient, visitor or staff member, including:\n- Falls and injuries.\n- Medication errors and near misses.\n- Overdoses or medical emergencies.\n- Aggressive or violent behavior, threats and property damage.\n- Patients leaving against medical advice or going missing.\n- Allegations of abuse, neglect or exploitation (these also require a report to the proper authority).\n- Security, privacy and safety problems.\n\nHow to report:\n- First make sure everyone is safe and get medical help if needed.\n- Notify your supervisor right away.\n- Complete the incident report as soon as possible, and before the end of your shift.\n- Write facts: what you saw and heard, when and where, who was involved, and what was done. Use quotes when helpful. Do not guess, blame or give opinions.\n- Do not put the incident report in the patient's clinical record. Document the clinical facts of the event in the record.\n\nSome serious incidents must be reported to the state or other agencies within set timeframes. Your supervisor and the agency's policy explain which ones.\n\nNear misses count. Reporting them helps prevent the next incident.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "When should an incident report be completed?",
    "o": [
     "Only if someone was hurt",
     "Within a week",
     "As soon as possible, and before the end of your shift",
     "Only if a supervisor asks"
    ],
    "a": 2
   },
   {
    "q": "An incident report should include:",
    "o": [
     "Only the patient's diagnosis",
     "Objective facts: what happened, when, where, who and what was done",
     "Your opinion of who is at fault",
     "Rumors from other staff"
    ],
    "a": 1
   },
   {
    "q": "A medication was almost given to the wrong patient but caught in time. Should it be reported?",
    "o": [
     "Only if it happens twice",
     "Yes, near misses should be reported",
     "Only if the patient noticed",
     "No, nothing happened"
    ],
    "a": 1
   },
   {
    "q": "Where does the incident report itself go?",
    "o": [
     "To the incident reporting system or supervisor, not the clinical record",
     "To the patient's family",
     "In your personal files",
     "In the patient's clinical record"
    ],
    "a": 0
   },
   {
    "q": "What is the first thing to do when an incident occurs?",
    "o": [
     "Take photos for social media",
     "Make sure everyone is safe and get help if needed",
     "Fill out the report",
     "Call the patient's family"
    ],
    "a": 1
   }
  ]
 },
 {
  "title": "Abuse, Neglect and Exploitation Reporting",
  "description": "Recognizing and reporting abuse, neglect and exploitation as a mandated reporter.",
  "content": "Staff in health and human services are mandated reporters. You must report suspected abuse, neglect or exploitation of children, older adults and vulnerable adults as required by state law.\n\nTypes to recognize:\n- Physical abuse: hitting, pushing, unexplained injuries, improper restraint.\n- Sexual abuse: any unwanted sexual contact or exploitation.\n- Emotional or verbal abuse: threats, humiliation, intimidation, isolation.\n- Neglect: failing to provide food, shelter, hygiene, medical care or supervision, including self-neglect.\n- Financial exploitation: misuse of someone's money, property or benefits.\n\nWarning signs include unexplained injuries, fear of a certain person, sudden changes in behavior, poor hygiene, missing money or belongings, and inconsistent explanations.\n\nWhat to do:\n- Make sure the person is safe and get medical help if needed.\n- Report right away to the state hotline or agency required by law (for example child protective services or adult protective services), and to law enforcement when someone is in immediate danger. Many states require an immediate report or a report within 24 hours.\n- Notify your supervisor, but telling a supervisor does not replace your own duty to report.\n- You only need a reasonable suspicion. Do not investigate or wait for proof.\n- Document what you observed, factually.\n\nReports made in good faith are protected by law, and retaliation is prohibited. Failing to report can lead to penalties.\n\nStaff must never abuse, neglect or exploit anyone in their care. Any allegation against staff is investigated, and the staff member may be removed from patient contact during the investigation.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "To make a report, you need:",
    "o": [
     "Proof of abuse",
     "The victim's written permission",
     "A reasonable suspicion",
     "A supervisor's approval"
    ],
    "a": 2
   },
   {
    "q": "Telling your supervisor about suspected abuse:",
    "o": [
     "Does not replace your own duty to report as required by law",
     "Must happen before you check on the person's safety",
     "Fully satisfies your duty to report",
     "Is not allowed"
    ],
    "a": 0
   },
   {
    "q": "A patient's family member has been using the patient's benefits for themselves. This is:",
    "o": [
     "Only reportable if over $10,000",
     "A private family matter",
     "Possible financial exploitation that must be reported",
     "Neglect by the agency"
    ],
    "a": 2
   },
   {
    "q": "Someone is in immediate danger. You should:",
    "o": [
     "Wait for the investigator",
     "Call 911 or law enforcement and make the required report",
     "Write it in tomorrow's note",
     "Ask the suspected abuser what happened"
    ],
    "a": 1
   },
   {
    "q": "Is a staff member who reports in good faith protected from retaliation?",
    "o": [
     "Only if they report anonymously",
     "No",
     "Yes",
     "Only if the report is proven true"
    ],
    "a": 2
   }
  ]
 },
 {
  "title": "Ethics and Professional Conduct",
  "description": "Boundaries, conflicts of interest and professional behavior.",
  "content": "Ethical conduct builds trust with patients, families, co-workers and the community.\n\nProfessional boundaries:\n- Keep relationships with patients professional. No romantic, sexual, financial or business relationships with patients or their family members.\n- Avoid dual relationships, such as treating a friend or relative.\n- Do not share personal contact information or connect with patients on social media.\n- Do not accept or give gifts, money or favors beyond what policy allows.\n\nConflicts of interest: tell your supervisor about any outside job, financial interest or relationship that could affect your work decisions.\n\nScope of practice: work only within your license, certification, training and job description. Ask for help when something is outside your competence.\n\nFitness for duty: never work while impaired by alcohol, drugs, or anything else that affects your judgment.\n\nHonesty: document truthfully, bill accurately, and never falsify records or signatures.\n\nRespect: treat everyone with courtesy, and do not tolerate harassment, discrimination or bullying.\n\nSpeak up: report ethical concerns, misconduct, or violations of law or policy to your supervisor or the Compliance Officer. Retaliation against people who report in good faith is prohibited.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "A former patient asks you out on a date. What should you do?",
    "o": [
     "Accept if they were discharged",
     "Decline and follow policy, which prohibits these relationships",
     "Ask a co-worker for permission",
     "Accept but keep it secret"
    ],
    "a": 1
   },
   {
    "q": "A patient sends you a friend request on social media. You should:",
    "o": [
     "Accept but restrict what they can see",
     "Accept after discharge",
     "Accept to build rapport",
     "Not accept, and follow the social media policy"
    ],
    "a": 3
   },
   {
    "q": "You are asked to perform a task outside your license and training. You should:",
    "o": [
     "Decline and ask for help from someone qualified",
     "Do it if no one is watching",
     "Do it and document it later",
     "Do it to help out"
    ],
    "a": 0
   },
   {
    "q": "You have a financial interest in a vendor the agency is considering. You should:",
    "o": [
     "Promote the vendor",
     "Resign immediately",
     "Disclose it to your supervisor",
     "Say nothing"
    ],
    "a": 2
   },
   {
    "q": "You notice a co-worker falsifying a signature. What should you do?",
    "o": [
     "Ignore it",
     "Report it to your supervisor or the Compliance Officer",
     "Confront them in front of patients",
     "Post about it online"
    ],
    "a": 1
   }
  ]
 },
 {
  "title": "Cultural Competency",
  "description": "Providing respectful, effective care to people of all backgrounds.",
  "content": "Cultural competency means providing care that respects each person's culture, language, beliefs and identity.\n\nCulture includes race, ethnicity, language, religion, age, gender identity, sexual orientation, disability, income, education, geography and life experience. Each person is an individual; avoid assumptions based on any group.\n\nPractices that help:\n- Ask about preferences, beliefs and what matters to the person. Use the name and pronouns they prefer.\n- Offer qualified interpreters at no cost to people with limited English proficiency or who are deaf or hard of hearing. Do not rely on family members, and never on children, to interpret.\n- Provide written materials in plain language and in the person's language when available.\n- Use person-first, non-stigmatizing language. Say \"person with a substance use disorder,\" not \"addict\" or \"abuser.\"\n- Be aware of your own biases and how they may affect care.\n- Recognize that trauma, discrimination and mistrust of health care can affect how people engage in treatment.\n\nThe National Standards for Culturally and Linguistically Appropriate Services (CLAS) guide agencies in providing equitable, respectful care.\n\nDiscrimination against patients or staff is prohibited. Report concerns to your supervisor.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "A patient has limited English proficiency. Who should interpret?",
    "o": [
     "Any bilingual patient in the lobby",
     "The patient's 12-year-old child",
     "A qualified interpreter",
     "No one; speak slowly in English"
    ],
    "a": 2
   },
   {
    "q": "Which is person-first, non-stigmatizing language?",
    "o": [
     "Person with a substance use disorder",
     "User",
     "Abuser",
     "Addict"
    ],
    "a": 0
   },
   {
    "q": "The best way to learn a patient's preferences is to:",
    "o": [
     "Ask them respectfully",
     "Assume based on their background",
     "Ignore preferences to treat everyone the same",
     "Ask a co-worker of the same background"
    ],
    "a": 0
   },
   {
    "q": "Cultural competency includes being aware of:",
    "o": [
     "Only language differences",
     "Your own biases and how they may affect care",
     "Nothing beyond the treatment plan",
     "Only the patient's religion"
    ],
    "a": 1
   },
   {
    "q": "Interpreter services for patients should be:",
    "o": [
     "Charged to the patient",
     "Avoided to save time",
     "Provided only when convenient",
     "Provided at no cost"
    ],
    "a": 3
   }
  ]
 },
 {
  "title": "Co-occurring Disorders",
  "description": "Understanding and treating mental health and substance use disorders together.",
  "content": "Co-occurring disorders means a person has both a mental health disorder and a substance use disorder at the same time. This is common: a large share of people with a substance use disorder also have a mental health condition.\n\nWhy it matters:\n- Each condition can worsen the other. For example, anxiety may lead to drinking, and alcohol use can deepen depression.\n- Symptoms can overlap. Some symptoms are caused by substance use or withdrawal and improve with abstinence; others are independent conditions that need their own treatment.\n- People with co-occurring disorders have higher risk of relapse, hospitalization, homelessness and suicide.\n\nBest practices:\n- \"No wrong door\": screen everyone for both mental health and substance use, wherever they enter care.\n- Integrated treatment: address both conditions at the same time, in a coordinated plan, rather than one after the other.\n- Use stage-wise, motivational approaches that meet the person where they are.\n- Coordinate with prescribers and other providers, with proper consent.\n- Watch for safety risks, including suicide and overdose. Make sure people know about naloxone.\n\nAvoid telling someone they must be sober before mental health concerns can be addressed, or that they must fix their mental health before addressing substance use.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "Co-occurring disorders means:",
    "o": [
     "Two physical illnesses",
     "Two substance use disorders",
     "A disorder that runs in families",
     "A mental health disorder and a substance use disorder at the same time"
    ],
    "a": 3
   },
   {
    "q": "The recommended approach is:",
    "o": [
     "Integrated treatment of both at the same time",
     "Refer out and do not treat either",
     "Treat mental health first, then substance use",
     "Treat substance use first, then mental health"
    ],
    "a": 0
   },
   {
    "q": "\"No wrong door\" means:",
    "o": [
     "Doors stay unlocked",
     "Patients can only enter through one program",
     "Screen for both conditions wherever a person enters care",
     "Anyone can access records"
    ],
    "a": 2
   },
   {
    "q": "Some symptoms that look like a mental illness may be caused by:",
    "o": [
     "Good nutrition",
     "Sleeping well",
     "Exercise",
     "Substance use or withdrawal"
    ],
    "a": 3
   },
   {
    "q": "People with co-occurring disorders are at higher risk of:",
    "o": [
     "Better outcomes without help",
     "Nothing in particular",
     "Only physical illness",
     "Relapse, hospitalization and suicide"
    ],
    "a": 3
   }
  ]
 },
 {
  "title": "Clinical Documentation",
  "description": "Writing timely, accurate and compliant clinical records.",
  "content": "The clinical record is a legal document. It supports quality care, communication between staff, and billing.\n\nGood documentation is:\n- Timely: completed as soon as possible after the service, within the timeframe in agency policy.\n- Accurate and objective: what you observed, what the patient said (in quotes when helpful), what you did, and the patient's response. Avoid opinions, labels and judgmental language.\n- Complete: includes date, start and end times when required, type of service, goals addressed, interventions, progress, and the plan.\n- Linked to the treatment plan: notes should show how the service addressed the patient's goals.\n- Signed and dated with your name and credentials.\n\nRules:\n- If it was not documented, it was not done.\n- Never backdate, pre-write notes, or document services that did not happen.\n- Never sign for someone else or share your login.\n- Late entries must be clearly labeled as late entries, with the actual date and time they were written.\n- To correct an error, follow policy: on paper, draw a single line through it, then initial and date; in an electronic record, use the amendment or addendum feature. Never erase, white out or delete original entries.\n\nDocumentation that does not support the service billed can lead to repayment, penalties and fraud findings.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "\"If it was not documented, it was not done\" means:",
    "o": [
     "Only billing staff need to document",
     "Verbal reports are enough",
     "Services without documentation are treated as not provided",
     "Documentation is optional"
    ],
    "a": 2
   },
   {
    "q": "You forgot to write a note yesterday. Today you should:",
    "o": [
     "Ask a co-worker to write it",
     "Write it as a clearly labeled late entry with the actual date and time written",
     "Skip it",
     "Write it with yesterday's date and time"
    ],
    "a": 1
   },
   {
    "q": "How do you correct an error in a paper record?",
    "o": [
     "Tear out the page",
     "Draw a single line through it, then initial and date",
     "Scribble over it",
     "White it out"
    ],
    "a": 1
   },
   {
    "q": "Which is objective documentation?",
    "o": [
     "Patient is manipulative",
     "Patient said, \"I don't want to talk today,\" and left the session after 10 minutes",
     "Patient was being difficult",
     "Patient seemed lazy"
    ],
    "a": 1
   },
   {
    "q": "A co-worker asks you to sign their note because they are out. You should:",
    "o": [
     "Decline; never sign for someone else",
     "Sign your own name on their note",
     "Sign their name",
     "Use their login"
    ],
    "a": 0
   }
  ]
 },
 {
  "title": "Treatment Planning",
  "description": "Writing individualized, person-centered treatment plans.",
  "content": "The treatment plan is the roadmap for each person's care. It must be individualized and developed with the person, not for them.\n\nA good treatment plan:\n- Is based on the assessment, including strengths, needs, abilities and preferences.\n- Uses the person's own words for what they want to achieve.\n- Lists problems or needs, long-term goals, and short-term objectives that are SMART: specific, measurable, achievable, relevant and time-bound.\n- Lists interventions: what services will be provided, how often, and by whom.\n- Includes discharge or transition planning from the start.\n- Is signed by the person (and guardian when applicable) and the responsible staff.\n\nExample objective: \"Within 30 days, client will attend at least 3 support group meetings per week, as shown by attendance logs.\" This is measurable, unlike \"client will do better.\"\n\nReviewing and updating:\n- Review the plan at the intervals required by policy and regulation, and whenever there is a significant change, such as a crisis, relapse, new diagnosis or goal met.\n- Progress notes should show which goals each service addressed.\n\nInvolve family and other supports when the person consents, and coordinate with other providers.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "A treatment plan should be developed:",
    "o": [
     "By staff alone",
     "With the person receiving services",
     "By the insurance company",
     "Only at discharge"
    ],
    "a": 1
   },
   {
    "q": "Which objective is measurable?",
    "o": [
     "Client will improve coping",
     "Client will try harder",
     "Client will feel better",
     "Client will attend at least 3 support groups per week for 30 days"
    ],
    "a": 3
   },
   {
    "q": "SMART stands for:",
    "o": [
     "Safe, Managed, Approved, Reviewed, Tested",
     "Structured, Monitored, Assigned, Recorded, Tracked",
     "Specific, Measurable, Achievable, Relevant, Time-bound",
     "Simple, Medical, Accurate, Routine, Timely"
    ],
    "a": 2
   },
   {
    "q": "When should a treatment plan be updated outside the scheduled review?",
    "o": [
     "Never",
     "Only at discharge",
     "When there is a significant change, such as a crisis or relapse",
     "Only once a year"
    ],
    "a": 2
   },
   {
    "q": "Interventions in the plan should state:",
    "o": [
     "Only the patient's address",
     "Only the payer",
     "What service, how often, and who provides it",
     "Only the diagnosis"
    ],
    "a": 2
   }
  ]
 },
 {
  "title": "Suicide and Risk Assessment",
  "description": "Screening, assessing and responding to suicide risk (for staff whose duties include it).",
  "content": "This training is for staff whose duties include screening or assessing for suicide and safety risk.\n\nFacts:\n- Asking directly about suicide does not plant the idea or increase risk. It opens the door to help.\n- Use direct language: \"Are you thinking about killing yourself?\"\n\nScreening and assessment:\n- Use the validated tools required by agency policy, such as the Columbia Suicide Severity Rating Scale (C-SSRS) or the ASQ.\n- Ask about thoughts, plans, intent, access to means, past attempts and recent behavior.\n- Consider risk factors: previous attempts, mental illness, substance use, chronic pain, recent losses, isolation, access to firearms or medications, and history of trauma.\n- Notice warning signs: talking about wanting to die or being a burden, giving away possessions, withdrawing, sudden calm after depression, increased substance use.\n- Identify protective factors: supportive relationships, reasons for living, engagement in care.\n\nResponding:\n- Imminent risk: do not leave the person alone. Notify your supervisor and follow the emergency procedure, including 911 when needed.\n- Develop a written safety plan with the person: warning signs, coping strategies, people and places for support, professionals to contact, and making the environment safer.\n- Lethal means counseling: talk with the person and their supports about limiting access to firearms and medications.\n- Share the 988 Suicide and Crisis Lifeline (call or text 988).\n- Document the screening, your assessment of risk, actions taken and follow-up.",
  "required_for": [],
  "questions": [
   {
    "q": "Does asking someone directly about suicide increase their risk?",
    "o": [
     "Only if asked twice",
     "Only for teenagers",
     "Yes",
     "No"
    ],
    "a": 3
   },
   {
    "q": "A patient says they plan to end their life tonight and has the means. You should:",
    "o": [
     "Tell them to call a friend",
     "Schedule a follow-up next week",
     "Not leave them alone, notify your supervisor and follow emergency procedures",
     "Document it and let them leave"
    ],
    "a": 2
   },
   {
    "q": "Which is a validated suicide screening tool?",
    "o": [
     "A vision chart",
     "The Columbia Suicide Severity Rating Scale (C-SSRS)",
     "A blood pressure cuff",
     "A pain scale"
    ],
    "a": 1
   },
   {
    "q": "Lethal means counseling focuses on:",
    "o": [
     "Stopping therapy",
     "Increasing medication doses",
     "Reducing access to firearms and medications",
     "Removing all furniture"
    ],
    "a": 2
   },
   {
    "q": "What is the number for the Suicide and Crisis Lifeline?",
    "o": [
     "211",
     "311",
     "411",
     "988"
    ],
    "a": 3
   }
  ]
 },
 {
  "title": "Anti-Kickback, Referral Fees and Patient Brokering",
  "description": "Federal and state laws against paying or receiving anything for patient referrals.",
  "content": "It is illegal to pay or receive anything of value in exchange for patient referrals. These laws protect patients from being treated as a commodity and protect health care programs from fraud.\n\nKey laws:\n- Federal Anti-Kickback Statute: makes it a crime to knowingly and willfully offer, pay, solicit or receive anything of value to induce or reward referrals of services paid by federal health care programs such as Medicare and Medicaid. Penalties include prison of up to 10 years, large fines and exclusion from federal health care programs.\n- Eliminating Kickbacks in Recovery Act (EKRA): applies to recovery homes, clinical treatment facilities and laboratories, and covers services paid by private insurance as well as public programs. Penalties include fines of up to $200,000 and prison of up to 10 years for each occurrence.\n- Stark Law: limits physicians from referring patients for certain health services to businesses they, or their family, have a financial relationship with, unless an exception applies.\n- State patient brokering laws: many states also make it a crime to pay or receive anything to induce patient referrals, including to substance use treatment and recovery residences.\n\n\"Anything of value\" includes cash, gift cards, free rent or housing, travel, meals, phones, free services, waived copays and inflated payments.\n\nRed flags to avoid and report:\n- Paying a person, \"marketer\" or recruiter per patient admitted, or offering referral bonuses.\n- Offering patients free housing, flights, cash or gifts to enroll or stay in treatment.\n- Routinely waiving copays or deductibles.\n- Accepting gifts, meals or payments from labs, sober homes or providers in exchange for sending them patients.\n- Marketing staff paid commissions based on admissions or tests ordered.\n\nSome arrangements are allowed under specific safe harbors or exceptions. They must be reviewed by the Compliance Officer or legal counsel before anything is agreed.\n\nIf you are offered anything for a referral, or see a possible kickback, report it to the Compliance Officer. You can also report to the HHS Office of Inspector General hotline. Retaliation against people who report in good faith is prohibited.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "A sober home offers you $200 for each patient you refer to them. This is:",
    "o": [
     "Allowed if paid in gift cards",
     "A normal marketing fee",
     "A possible illegal kickback that must be refused and reported",
     "Allowed if the patient agrees"
    ],
    "a": 2
   },
   {
    "q": "Under EKRA, kickback rules for recovery homes and treatment facilities apply to services paid by:",
    "o": [
     "Only Medicaid",
     "Only Medicare",
     "Private insurance as well as public programs",
     "Cash-paying patients only"
    ],
    "a": 2
   },
   {
    "q": "Which counts as \"anything of value\" under kickback laws?",
    "o": [
     "Only cash",
     "Only checks over $1,000",
     "Cash, gift cards, free housing, travel and waived copays",
     "Only payments to doctors"
    ],
    "a": 2
   },
   {
    "q": "Paying a marketer a bonus for every patient admitted is:",
    "o": [
     "Fine if it is under $100",
     "Required by insurers",
     "A red flag that may violate federal and state law",
     "A best practice"
    ],
    "a": 2
   },
   {
    "q": "You are offered a gift in exchange for referrals. What should you do?",
    "o": [
     "Accept it if it is small",
     "Share it with your team",
     "Decline and report it to the Compliance Officer",
     "Keep it quiet"
    ],
    "a": 2
   }
  ]
 },
 {
  "title": "Fraud, Waste and Abuse",
  "description": "Billing integrity, the False Claims Act, and how to report concerns.",
  "content": "Health care fraud, waste and abuse cost billions of dollars each year and harm patients.\n\nDefinitions:\n- Fraud: knowingly submitting false information to get payment, such as billing for services not provided.\n- Waste: overusing services or resources, often through carelessness.\n- Abuse: practices that result in unnecessary costs, such as billing for services that are not medically necessary.\n\nExamples to avoid:\n- Billing for services not provided, or for more time than was spent.\n- Upcoding: billing a higher-level service than the one provided.\n- Unbundling: billing separately for services that should be billed together.\n- Documentation that does not support the service billed.\n- Providing services that are not medically necessary.\n- Altering or backdating records.\n\nThe False Claims Act makes it illegal to knowingly submit false claims to federal health care programs. Violations can bring three times the government's losses plus penalties for each false claim. The law also protects whistleblowers who report fraud from retaliation.\n\nExcluded individuals: people and entities excluded from federal health care programs cannot be paid, directly or indirectly, with federal program funds. Agencies check the HHS Office of Inspector General exclusion list before hiring and regularly afterward. Tell the agency right away if you are ever excluded or sanctioned.\n\nHow to report: tell your supervisor or the Compliance Officer, or use the compliance hotline. You may also report to the HHS Office of Inspector General. Reports can often be made anonymously, and retaliation for good-faith reports is prohibited.",
  "required_for": [
   "employee",
   "manager"
  ],
  "questions": [
   {
    "q": "Billing for a 60-minute session that lasted 20 minutes is:",
    "o": [
     "Acceptable rounding",
     "Allowed if the patient agrees",
     "Fraud",
     "Waste only"
    ],
    "a": 2
   },
   {
    "q": "\"Upcoding\" means:",
    "o": [
     "Updating software",
     "Using new codes",
     "Coding faster",
     "Billing a higher-level service than the one provided"
    ],
    "a": 3
   },
   {
    "q": "Under the False Claims Act, a person who reports fraud in good faith:",
    "o": [
     "Loses their license",
     "Is protected from retaliation",
     "Must pay a fee",
     "Can be fired for it"
    ],
    "a": 1
   },
   {
    "q": "Why does the agency check the OIG exclusion list?",
    "o": [
     "It is optional",
     "To find new employees",
     "Because excluded individuals cannot be paid with federal health care program funds",
     "To verify home addresses"
    ],
    "a": 2
   },
   {
    "q": "You suspect a co-worker is billing for services that did not happen. You should:",
    "o": [
     "Confront them publicly",
     "Change their billing yourself",
     "Report it to your supervisor, the Compliance Officer or the compliance hotline",
     "Ignore it"
    ],
    "a": 2
   }
  ]
 }
]$library$;
  m jsonb;
  qn jsonb;
  module_id uuid;
  question_id uuid;
  pos int;
begin
  for m in select * from jsonb_array_elements(library) loop
    if exists (select 1 from public.training_modules t where t.company_id is null and t.title = m ->> 'title') then
      continue;
    end if;
    insert into public.training_modules (company_id, title, description, content, passing_score, renew_months, required_for, active)
    values (null, m ->> 'title', m ->> 'description', m ->> 'content', 80, 12,
            array(select jsonb_array_elements_text(m -> 'required_for')), false)
    returning id into module_id;
    pos := 0;
    for qn in select * from jsonb_array_elements(m -> 'questions') loop
      insert into public.training_questions (module_id, position, question, options)
      values (module_id, pos, qn ->> 'q', qn -> 'o')
      returning id into question_id;
      insert into public.training_answer_keys (question_id, correct_index) values (question_id, (qn ->> 'a')::int);
      pos := pos + 1;
    end loop;
  end loop;
end;
$seed$;
