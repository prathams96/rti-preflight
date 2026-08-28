import type {
  InformationNeed,
  Language,
  RenderableResolution,
} from "../domain/types";
import type { DisclosureEntry } from "../disclosure/ledger";
import type { FictionalFilingProfile } from "../filing/types";

const HINDI_TEXT: Record<string, string> = {
  "We couldn’t prepare an RTI draft just now.":
    "अभी RTI ड्राफ्ट तैयार नहीं हो सका।",
  "Enter the information you are looking for to continue.":
    "जारी रखने के लिए वह जानकारी लिखें जिसे आप ढूँढ रहे हैं।",
  "Confirm the question before searching.":
    "खोज शुरू करने से पहले सवाल की पुष्टि करें।",
  "We found an answer using official government data":
    "हमें आधिकारिक सरकारी डेटा से एक उत्तर मिला",
  "The answer below was calculated from published NCRB figures for 2021 and 2023.":
    "नीचे दिया गया उत्तर 2021 और 2023 के प्रकाशित NCRB आँकड़ों से निकाला गया है।",
  "Calculated from official data": "आधिकारिक डेटा से गणना की गई",
  "We couldn’t find a reliable public answer":
    "हमें विश्वसनीय सार्वजनिक उत्तर नहीं मिला",
  "The government sources checked by this prototype do not fully answer your question. An RTI may help you request the information directly from the relevant authority.":
    "इस प्रोटोटाइप में जाँचे गए सरकारी स्रोत आपके सवाल का पूरा जवाब नहीं देते। संबंधित प्राधिकरण से सीधे जानकारी माँगने के लिए RTI मदद कर सकती है।",
  "The sources checked did not provide a reliable answer":
    "जाँचे गए स्रोतों से विश्वसनीय उत्तर नहीं मिला",
  "We found a similar earlier RTI response":
    "हमें ऐसी ही एक पिछली RTI का जवाब मिला",
  "An earlier response may help answer your question before you file a new RTI.":
    "नई RTI दाखिल करने से पहले पिछला जवाब आपके सवाल का उत्तर देने में मदद कर सकता है।",
  "Prototype example — this is not a real RTI response.":
    "प्रोटोटाइप उदाहरण — यह वास्तविक RTI उत्तर नहीं है।",
  "You may not need an RTI for this":
    "इसके लिए आपको RTI की ज़रूरत नहीं पड़ सकती",
  "EPF claim status can be checked through an official EPFO service. For personal claim status, using the official service is usually quicker than filing an RTI.":
    "EPF दावे की स्थिति आधिकारिक EPFO सेवा से जाँची जा सकती है। अपने दावे की स्थिति के लिए आधिकारिक सेवा का इस्तेमाल आमतौर पर RTI दाखिल करने से जल्दी होता है।",
  "Official service available": "आधिकारिक सेवा उपलब्ध है",
  "We found part of the information": "हमें कुछ जानकारी मिली",
  "Official sources answer part of your question, but some information is still missing.":
    "आधिकारिक स्रोत आपके सवाल का कुछ हिस्सा बताते हैं, लेकिन कुछ जानकारी अभी बाकी है।",
  "Official sources show different figures":
    "आधिकारिक स्रोतों में अलग-अलग आँकड़े हैं",
  "We found two official sources that report this differently. We therefore cannot confirm one figure as the correct answer.":
    "हमें दो आधिकारिक स्रोत मिले जो अलग-अलग आँकड़े बताते हैं। इसलिए हम किसी एक आँकड़े को सही उत्तर के रूप में पक्का नहीं कर सकते।",
  "Available from an official source": "आधिकारिक स्रोत पर उपलब्ध",
  "It is available from an official government source, so you may not need to file an RTI for this information.":
    "यह आधिकारिक सरकारी स्रोत पर उपलब्ध है, इसलिए इस जानकारी के लिए आपको RTI दाखिल करने की ज़रूरत नहीं पड़ सकती।",
  "Part of the information was found": "कुछ जानकारी मिली",
  "Official sources report different figures":
    "आधिकारिक स्रोत अलग-अलग आँकड़े बताते हैं",
  "A written reply can be requested through RTI":
    "RTI के ज़रिए लिखित उत्तर माँगा जा सकता है",
  "You can ask the relevant government authority for a written reply":
    "आप संबंधित सरकारी प्राधिकरण से लिखित उत्तर माँग सकते हैं",
  "You chose a written reply, so you can prepare an RTI draft for the relevant authority.":
    "आपने लिखित उत्तर चुना है, इसलिए आप संबंधित प्राधिकरण के लिए RTI ड्राफ्ट तैयार कर सकते हैं।",
  "Earlier RTI response example": "पिछली RTI के जवाब का उदाहरण",
  "Prototype example": "प्रोटोटाइप उदाहरण",
  "This is a fictional, identity-free example about a generic public programme. It is not a real RTI response and does not reproduce a government record.":
    "यह एक सामान्य सार्वजनिक कार्यक्रम के बारे में काल्पनिक, पहचान-रहित उदाहरण है। यह वास्तविक RTI उत्तर नहीं है और किसी सरकारी रिकॉर्ड की प्रति नहीं है।",
  "This prototype checks a limited set of saved government sources. It is not searching government systems live.":
    "यह प्रोटोटाइप सीमित संख्या में सहेजे गए सरकारी स्रोतों को जाँचता है। यह सरकारी सिस्टम को लाइव नहीं खोज रहा है।",
  "Calculated from official figures—not directly stated by NCRB.":
    "आधिकारिक आँकड़ों से गणना की गई — NCRB ने इसे सीधे नहीं बताया है।",
  "No reliable finding from the checked snapshot":
    "जाँचे गए सरकारी स्रोतों से विश्वसनीय उत्तर नहीं मिला",
  "Outside the prototype Evidence Snapshot":
    "जाँचे गए सरकारी स्रोतों के दायरे से बाहर",
  "The checked snapshot did not support a reliable finding.":
    "जाँचे गए सरकारी स्रोतों से विश्वसनीय उत्तर नहीं मिला।",
  "This does not establish that the records are unavailable or unpublished. You can prepare a focused RTI for the missing records.":
    "यह इस बात की पुष्टि नहीं करता कि रिकॉर्ड उपलब्ध हैं या नहीं। गुम जानकारी के लिए केंद्रित RTI तैयार की जा सकती है।",
  "The prototype Evidence Snapshot checked its registered Northern Railway filing fixture and found no supporting records.":
    "इस प्रोटोटाइप ने Northern Railway से जुड़े जाँचे गए स्रोतों को देखा, लेकिन सहायक रिकॉर्ड नहीं मिला।",
  "Prepare a focused RTI asking for the missing records.":
    "गुम रिकॉर्ड माँगने वाली केंद्रित RTI तैयार करें।",
  "The snapshot contains no supporting expenditure statement, ledger extract, work order, or contractor record for this need.":
    "जाँचे गए स्रोतों में इस सवाल के लिए व्यय विवरण, लेजर अंश, कार्यादेश या ठेकेदार की जानकारी नहीं मिली।",
  "Review the formal-response path and prepare a Filing Draft when ready.":
    "लिखित उत्तर का विकल्प देखें और तैयार होने पर RTI ड्राफ्ट बनाएँ।",
  "Prepare a records-focused Filing Draft asking for orders, notes, reports, or correspondence rather than an explanation of why.":
    "कारण बताने के बजाय आदेश, नोट, रिपोर्ट या पत्राचार माँगने वाला RTI ड्राफ्ट तैयार करें।",
  "Review Search Scope, edit the Information Need, or prepare a Filing Draft.":
    "क्या जाँचा गया देखें, सवाल बदलें या RTI ड्राफ्ट तैयार करें।",
  "The requested authority or publication is not registered in this snapshot.":
    "माँगा गया प्राधिकरण या प्रकाशन यहाँ जाँचे गए स्रोतों में शामिल नहीं है।",
  "A new written response remains available for this Information Need.":
    "इस सवाल के लिए नया लिखित उत्तर माँगा जा सकता है।",
  "This is an independent research assistant—not an official RTI response.":
    "यह स्वतंत्र शोध सहायक है — आधिकारिक RTI उत्तर नहीं।",
  "The prototype checked the registered Northern Railway in-scope no-finding fixture and found no supporting records.":
    "इस प्रोटोटाइप ने Northern Railway से जुड़े जाँचे गए स्रोतों को देखा, लेकिन सहायक रिकॉर्ड नहीं मिला।",
  "Which municipal corporation or city, and which financial year should be checked?":
    "किस नगरपालिका या शहर और किस वित्तीय वर्ष की जाँच की जानी चाहिए?",
  "Review the calculation and save the finding, or prepare an RTI if you still need an official response.":
    "गणना देखें और निष्कर्ष सहेजें, या आधिकारिक उत्तर अभी भी चाहिए तो RTI तैयार करें।",
  "The requested record is not identified as your own; self-service access is not represented for another person’s record.":
    "माँगा गया रिकॉर्ड आपके अपने रिकॉर्ड के रूप में पहचाना नहीं गया; दूसरे व्यक्ति के रिकॉर्ड के लिए स्व-सेवा पहुँच उपलब्ध नहीं है।",
  "The prototype does not retrieve personal records or accept account identifiers. Only the represented own-record service route can be opened.":
    "प्रोटोटाइप व्यक्तिगत रिकॉर्ड नहीं निकालता और खाता पहचानकर्ता स्वीकार नहीं करता। केवल दिखाया गया अपने रिकॉर्ड का सेवा मार्ग खोला जा सकता है।",
  "The prototype checked its Capability Manifest and found no registered source for this need.":
    "प्रोटोटाइप ने अपनी क्षमता सूची जाँची और इस ज़रूरत के लिए कोई पंजीकृत स्रोत नहीं पाया।",
  "A synthetic earlier RTI response fixture is available.":
    "पहले के RTI उत्तर का एक प्रोटोटाइप उदाहरण उपलब्ध है।",
  "This example demonstrates how a previous response could be displayed. It is fictional and does not represent an official response.":
    "यह उदाहरण दिखाता है कि पिछला उत्तर कैसे दिखाया जा सकता है। यह काल्पनिक है और आधिकारिक उत्तर नहीं है।",
  "Found through a Fictional RTI Response Fixture—not an official response":
    "RTI उत्तर के प्रोटोटाइप उदाहरण में मिला — यह आधिकारिक उत्तर नहीं है",
  "Review the fixture, or prepare a new RTI.":
    "फ़िक्स्चर देखें या नई RTI तैयार करें।",
  "This looks like your own personal EPF record.":
    "यह आपके अपने व्यक्तिगत EPF रिकॉर्ड जैसा लगता है।",
  "The official EPFO claim-status route is intended for a member’s own claim. This prototype does not enter credentials, access a record, or promise a status.":
    "आधिकारिक EPFO दावा-स्थिति मार्ग सदस्य के अपने दावे के लिए है। यह प्रोटोटाइप कोई क्रेडेंशियल दर्ज नहीं करता, रिकॉर्ड नहीं खोलता और स्थिति का वादा नहीं करता।",
  "Official service route—not a retrieved finding":
    "आधिकारिक सेवा — इससे कोई व्यक्तिगत रिकॉर्ड प्राप्त नहीं हुआ",
  "Check the status of an EPF claim": "EPF दावे की स्थिति जाँचें",
  "Use the official EPFO route yourself for your own claim. No account details are requested or transmitted by this prototype.":
    "अपने दावे के लिए आधिकारिक EPFO मार्ग का स्वयं उपयोग करें। यह प्रोटोटाइप खाते का कोई विवरण माँगता या भेजता नहीं है।",
  "The prototype classified this as an own-record service route; it did not retrieve a personal record or send any identifier.":
    "प्रोटोटाइप ने इसे अपने रिकॉर्ड का सेवा मार्ग माना; इसने कोई व्यक्तिगत रिकॉर्ड नहीं निकाला और कोई पहचानकर्ता नहीं भेजा।",
  "Open the official EPFO claim-status route yourself.":
    "आधिकारिक EPFO दावा-स्थिति मार्ग स्वयं खोलें।",
  "No personal record retrieved": "कोई व्यक्तिगत रिकॉर्ड प्राप्त नहीं हुआ",
  "An EPFO service route cannot establish another person’s record access.":
    "EPFO सेवा मार्ग किसी दूसरे व्यक्ति के रिकॉर्ड तक पहुँच तय नहीं कर सकता।",
  "Confirm whose EPF claim you need before choosing a route.":
    "मार्ग चुनने से पहले पुष्टि करें कि आपको किसका EPF दावा चाहिए।",
  "Possessing another person’s identifier is not permission to access their record. This prototype does not request an account number, Aadhaar, PAN, OTP, or government login. You can prepare a records-focused Filing Draft without a promise that the authority will disclose the record.":
    "किसी दूसरे व्यक्ति का पहचानकर्ता होना उसके रिकॉर्ड तक पहुँच की अनुमति नहीं है। यह प्रोटोटाइप खाता नंबर, आधार, PAN, OTP या सरकारी लॉगिन नहीं माँगता। प्राधिकरण रिकॉर्ड बताएगा, इसका वादा किए बिना रिकॉर्ड माँगने वाला RTI ड्राफ्ट तैयार किया जा सकता है।",
  "Prepare a conservative Filing Draft asking for records, if appropriate.":
    "उचित हो तो रिकॉर्ड माँगने वाला RTI ड्राफ्ट तैयार करें।",
  "This request is outside the prototype Evidence Snapshot.":
    "यह अनुरोध यहाँ जाँचे गए सरकारी स्रोतों के दायरे से बाहर है।",
  "The prototype cannot claim that the information is unavailable or unpublished. You can review the scope, edit the need, or prepare a Filing Draft.":
    "यह प्रोटोटाइप इस बात की पुष्टि नहीं कर सकता कि जानकारी उपलब्ध है या नहीं। आप क्या जाँचा गया देखें, सवाल बदलें या RTI ड्राफ्ट तैयार करें।",
  "Only registered authorities, measures, periods, and source types were checked.":
    "केवल पंजीकृत प्राधिकरण, माप, अवधियाँ और स्रोत प्रकार जाँचे गए।",
  "State/UT-wise Value of Property Stolen and Recovered, 2021–2023":
    "राज्य/केंद्र शासित प्रदेश के अनुसार चोरी और बरामद संपत्ति का मूल्य, 2021–2023",
  "National Crime Records Bureau, Ministry of Home Affairs":
    "राष्ट्रीय अपराध रिकॉर्ड ब्यूरो, गृह मंत्रालय",
  "2021–2023": "2021–2023",
  "EPFO Know Your Claim Status": "EPFO अपनी दावा-स्थिति जानें",
  "Employees' Provident Fund Organisation": "कर्मचारी भविष्य निधि संगठन",
  "Current own-record claim status": "वर्तमान अपने रिकॉर्ड के दावे की स्थिति",
  "EPFO Member Passbook": "EPFO सदस्य पासबुक",
  "Fictional RTI Response Fixture": "RTI उत्तर का प्रोटोटाइप उदाहरण",
  "Synthetic demonstration authority": "सिंथेटिक प्रदर्शन प्राधिकरण",
  "Fictional RTI Response Fixture—not an official response.":
    "RTI उत्तर का प्रोटोटाइप उदाहरण — यह आधिकारिक उत्तर नहीं है।",
  "A wholly fictional, identity-free demonstration response about a generic public programme. It is not a real response and does not reconstruct any government record.":
    "एक सामान्य सार्वजनिक कार्यक्रम के बारे में पूरी तरह काल्पनिक, पहचान-रहित प्रदर्शन उत्तर। यह वास्तविक उत्तर नहीं है और किसी सरकारी रिकॉर्ड का पुनर्निर्माण नहीं करता।",
  "Northern Railway in-scope no-finding fixture":
    "Northern Railway से जुड़े जाँचे गए स्रोत",
  "Synthetic demonstration fixture": "प्रोटोटाइप उदाहरण",
  "Fictional curated no-finding fixture—not a statement that records are unavailable or unpublished.":
    "काल्पनिक चुना हुआ प्रोटोटाइप उदाहरण — यह रिकॉर्ड उपलब्ध हैं या नहीं, इसकी पुष्टि नहीं करता।",
  "This fixture records that the prototype has no supporting expenditure statement, ledger extract, work order, or contractor record for the confirmed need.":
    "यह प्रोटोटाइप बताता है कि जाँचे गए स्रोतों में पुष्ट सवाल के लिए व्यय विवरण, लेजर अंश, कार्यादेश या ठेकेदार की जानकारी नहीं मिली।",
  "The confirmed Information Need selected a new written response.":
    "पुष्ट सवाल के लिए नया लिखित उत्तर चुना गया।",
  "Official table values are compared deterministically for each individual State/UT.":
    "हर अलग राज्य/केंद्र शासित प्रदेश के लिए आधिकारिक तालिका के मानों की तय नियमों से तुलना की जाती है।",
  "The reported value of property stolen increased while the reported recovery percentage declined between 2021 and 2023.":
    "2021 और 2023 के बीच रिपोर्ट की गई चोरी की संपत्ति का मूल्य बढ़ा, जबकि बरामदगी का रिपोर्ट किया गया प्रतिशत घटा।",
  "The prototype Evidence Snapshot checked the NCRB Table 20A.1 CSV for 2021–2023 and excluded three declared aggregate rows.":
    "इस प्रोटोटाइप ने 2021–2023 के लिए NCRB तालिका 20A.1 CSV जाँची और घोषित कुल वाली तीन पंक्तियाँ हटा दीं।",
  "Compare 2021 and 2023 stolen values and recovery percentages for each individual State/UT.":
    "हर अलग राज्य/केंद्र शासित प्रदेश के लिए 2021 और 2023 की चोरी की संपत्ति के मूल्य तथा बरामदगी प्रतिशत की तुलना करें।",
  "2023 stolen value > 2021 stolen value":
    "2023 की चोरी की संपत्ति का मूल्य > 2021 की चोरी की संपत्ति का मूल्य",
  "2023 recovery percentage < 2021 recovery percentage":
    "2023 का बरामदगी प्रतिशत < 2021 का बरामदगी प्रतिशत",
  "exclude declared aggregate rows before comparison":
    "तुलना से पहले घोषित कुल वाली पंक्तियाँ हटाएँ",
  "This identifies a reported data pattern, not a ranking of police performance. NCRB figures are supplied by States/UTs and may reflect differences in reporting and recording. Monetary values are in crore.":
    "यह रिपोर्ट किए गए आँकड़ों का पैटर्न बताता है, पुलिस के प्रदर्शन की रैंकिंग नहीं। NCRB आँकड़े राज्यों/केंद्र शासित प्रदेशों से मिलते हैं और रिपोर्टिंग व रिकॉर्डिंग के अंतर को दर्शा सकते हैं। मौद्रिक मान करोड़ में हैं।",
  "NCRB source and figures": "NCRB स्रोत और आँकड़े",
  "Real official public data, pinned to a versioned source copy.":
    "वास्तविक आधिकारिक सार्वजनिक डेटा, संस्करणित स्रोत प्रति से जोड़ा गया है।",
  "Evidence Snapshot": "प्रमाण स्नैपशॉट",
  "Curated, immutable prototype snapshot; not live or exhaustive.":
    "सीमित संख्या में सहेजे गए सरकारी स्रोत; लाइव या संपूर्ण खोज नहीं।",
  "Free-text interpretation": "मुक्त-पाठ व्याख्या",
  "Working deterministic adapter; OpenAI is server-only when configured.":
    "कार्यशील नियतात्मक अडैप्टर; कॉन्फ़िगर किए जाने पर OpenAI केवल सर्वर पर चलता है।",
  "Filtering and calculations": "फ़िल्टरिंग और गणनाएँ",
  "Working deterministic registered-table calculation engine.":
    "कार्यशील नियतात्मक पंजीकृत-तालिका गणना इंजन।",
  "Central Government public authority": "केंद्रीय सरकारी लोक प्राधिकरण",
  "3000 characters maximum": "अधिकतम 3000 अक्षर",
  bytes: "बाइट",
  "Previous RTI response": "पिछला RTI उत्तर",
  "Synthetic fixture only—not an official response.":
    "केवल प्रोटोटाइप उदाहरण — यह आधिकारिक उत्तर नहीं है।",
  "OTP, identity, payment, filing": "OTP, पहचान, भुगतान, फाइलिंग",
  "Simulated demonstration; no government integration.":
    "अनुकरण किया गया प्रदर्शन; कोई सरकारी एकीकरण नहीं।",
  "Government integration": "सरकारी एकीकरण",
  "Absent. No request, payment, or personal information is transmitted.":
    "अनुपस्थित। कोई अनुरोध, भुगतान या व्यक्तिगत जानकारी भेजी नहीं जाती।",
  "3,000-character text limit and overflow guidance":
    "3,000 अक्षरों की पाठ सीमा और अधिकता संबंधी निर्देश",
  "Northern Railway-Delhi Division authority listing":
    "Northern Railway-Delhi Division प्राधिकरण सूची",
  "Northern Railway RTI contact and authority page":
    "Northern Railway RTI संपर्क और प्राधिकरण पृष्ठ",
  "The record subject is not clear enough to select an own-record service route.":
    "अपने रिकॉर्ड की आधिकारिक सेवा चुनने के लिए रिकॉर्ड का विषय पर्याप्त रूप से स्पष्ट नहीं है।",
  "A source problem report is awaiting review; the original result remains visible.":
    "स्रोत की समस्या की रिपोर्ट की समीक्षा बाकी है; मूल नतीजा दिखाई दे रहा है।",
  "This result is shown as partial until the source is checked again after a source problem report.":
    "स्रोत की समस्या की रिपोर्ट के बाद स्रोत की फिर से जाँच होने तक यह नतीजा कुछ जानकारी के रूप में दिखाया गया है।",
};

const NEED_TEXT: Record<string, string> = {
  "Identify individual States/UTs where reported property stolen increased and recovery percentage declined between 2021 and 2023.":
    "2021 और 2023 के बीच जिन अलग-अलग राज्यों/केंद्र शासित प्रदेशों में रिपोर्ट की गई चोरी की संपत्ति बढ़ी और बरामदगी प्रतिशत घटा, उन्हें पहचानें।",
  "Value of property stolen and percentage recovered":
    "चोरी की संपत्ति का मूल्य और बरामदगी प्रतिशत",
  "All States/UTs": "सभी राज्य/केंद्र शासित प्रदेश",
  "A selected city or municipality": "चयनित शहर या नगरपालिका",
  "A selected district": "चयनित जिला",
  "A selected State/UT": "चयनित राज्य/केंद्र शासित प्रदेश",
  "New Delhi Railway Station": "नई दिल्ली रेलवे स्टेशन",
  "2021 versus 2023": "2021 बनाम 2023",
  "As reported by each State/UT":
    "हर राज्य/केंद्र शासित प्रदेश की रिपोर्ट के अनुसार",
  "As covered by the publications": "प्रकाशनों में शामिल के अनुसार",
  "Records of lift and escalator maintenance expenditure and contractors at New Delhi Railway Station.":
    "नई दिल्ली रेलवे स्टेशन पर लिफ्ट और एस्केलेटर के रखरखाव खर्च तथा ठेकेदारों के रिकॉर्ड।",
  "Maintenance expenditure, work orders, contracts, and contractor names":
    "रखरखाव खर्च, कार्यादेश, अनुबंध और ठेकेदारों के नाम",
  Contractor: "ठेकेदार",
  "State / UT": "राज्य / केंद्र शासित प्रदेश",
  "Financial year 2024–25": "वित्तीय वर्ष 2024–25",
  "The status of the citizen's own EPF claim.":
    "नागरिक के अपने EPF दावे की स्थिति।",
  "Status of my EPF claim": "मेरे EPF दावे की स्थिति",
  "My EPFO account": "मेरा EPFO खाता",
  "A record concerning another person's EPF claim, subject to lawful access.":
    "कानूनी पहुँच के अधीन किसी दूसरे व्यक्ति के EPF दावे से संबंधित रिकॉर्ड।",
  "Status of another person's EPF claim": "दूसरे व्यक्ति के EPF दावे की स्थिति",
  "Another person's EPFO account": "दूसरे व्यक्ति का EPFO खाता",
  "An EPF claim record whose subject must be confirmed.":
    "ऐसा EPF दावा रिकॉर्ड जिसका विषय पक्का करना है।",
  "Status of an EPF claim": "किसी EPF दावे की स्थिति",
  "EPFO account subject to confirmation": "पुष्टि किया जाने वाला EPFO खाता",
  Delhi: "दिल्ली",
  "Current claim": "वर्तमान दावा",
  Claim: "दावा",
  "A previously issued response relevant to a Central information need.":
    "केंद्रीय सूचना-ज़रूरत से संबंधित पहले जारी किया गया उत्तर।",
  "Relevant earlier RTI response": "संबंधित पिछला RTI उत्तर",
  "A selected Central public authority": "चुना गया केंद्रीय लोक प्राधिकरण",
  "Central public authority": "केंद्रीय लोक प्राधिकरण",
  "Public authority": "लोक प्राधिकरण",
  "Air-quality metric": "वायु-गुणवत्ता माप",
  "Applicable publication periods": "लागू प्रकाशन अवधियाँ",
  Publication: "प्रकाशन",
  "The public record or measure requested":
    "माँगा गया सार्वजनिक रिकॉर्ड या माप",
  "Not specified": "निर्दिष्ट नहीं",
  "Not yet specified": "अभी निर्दिष्ट नहीं",
  "To be confirmed": "पुष्टि की जानी है",
  Unknown: "अज्ञात",
};

const UNKNOWN_CLARIFICATION_PREFIX = "Unknown: ";

export function isUnknownClarification(value: string): boolean {
  return value.startsWith(UNKNOWN_CLARIFICATION_PREFIX);
}

export function clarificationQuestion(value: string): string {
  return isUnknownClarification(value)
    ? value.slice(UNKNOWN_CLARIFICATION_PREFIX.length)
    : value;
}

function translateText(text: string, language: Language): string {
  if (language === "en") return text;
  const formalSuffix =
    " You chose a written reply, so you can prepare an RTI draft for the relevant authority.";
  if (text.endsWith(formalSuffix))
    return `${translateText(text.slice(0, -formalSuffix.length), language)} आपने लिखित उत्तर चुना है, इसलिए संबंधित प्राधिकरण के लिए RTI ड्राफ्ट तैयार कर सकते हैं।`;
  for (const citationSuffix of [
    "A source problem report is awaiting review; the original result remains visible.",
    "This result is shown as partial until the source is checked again after a source problem report.",
  ]) {
    const suffix = ` ${citationSuffix}`;
    if (text.endsWith(suffix))
      return `${translateText(text.slice(0, -suffix.length), language)} ${HINDI_TEXT[citationSuffix]}`;
  }
  const exact = HINDI_TEXT[text] ?? NEED_TEXT[text];
  if (exact) return exact;
  const matchedStates = text.match(
    /^(\d+) States\/UTs matched the conditions in the official table\.$/,
  );
  if (matchedStates)
    return `${matchedStates[1]} राज्य/केंद्र शासित प्रदेश आधिकारिक तालिका की शर्तों से मेल खाते हैं।`;
  const matchedReferences = text.match(
    /^(\d+) immutable references with content hashes$/,
  );
  if (matchedReferences)
    return `${matchedReferences[1]} अपरिवर्तनीय संदर्भ, जिनमें सामग्री हैश हैं`;
  if (text === "Route metadata; no personal record was retrieved")
    return "मार्ग मेटाडेटा; कोई व्यक्तिगत रिकॉर्ड प्राप्त नहीं हुआ";
  if (text.startsWith("The prototype checked the registered ")) {
    const match = text.match(
      /^The prototype checked the registered (.+)\. (.+)$/,
    );
    return match
      ? `प्रोटोटाइप ने पंजीकृत ${translateText(match[1], language)} को जाँचा। ${translateText(match[2], language)}`
      : text;
  }
  if (text.startsWith("Fictional RTI Response Fixture—"))
    return `${translateText("Fictional RTI Response Fixture—not an official response.", language)} ${translateText(text.slice("Fictional RTI Response Fixture—not an official response. ".length), language)}`;
  if (text.startsWith("The requested record is not identified as your own;"))
    return "माँगा गया रिकॉर्ड आपके अपने रिकॉर्ड के रूप में पहचाना नहीं गया; दूसरे व्यक्ति के रिकॉर्ड के लिए स्व-सेवा पहुँच उपलब्ध नहीं है।";
  return text;
}

export function localizeText(text: string, language: Language): string {
  return translateText(text, language);
}

function localizeResultColumnLabel(label: string, language: Language): string {
  if (language === "en") return label;
  if (label === "State/UT") return "राज्य/केंद्र शासित प्रदेश";
  if (label === "Change") return "बदलाव";
  const comparison = label.match(/^(Stolen|Recovery) (\d{4} → \d{4})$/);
  if (!comparison) return label;
  return `${comparison[1] === "Stolen" ? "चोरी" : "बरामदगी"} ${comparison[2]}`;
}

const REVERSE_NEED_TEXT = Object.fromEntries(
  Object.entries(NEED_TEXT).map(([english, hindi]) => [hindi, english]),
);

export function canonicalizeNeedValue(
  value: string,
  language: Language,
): string {
  if (language === "en") return value;
  return REVERSE_NEED_TEXT[value] ?? value;
}

export function localizeFilingProfile(
  profile: FictionalFilingProfile,
  language: Language,
): FictionalFilingProfile {
  if (language === "en") return profile;
  return { ...profile, state: translateText(profile.state, language) };
}

export function localizeClarification(
  value: string,
  language: Language,
): string {
  const question = translateText(clarificationQuestion(value), language);
  return isUnknownClarification(value)
    ? `${language === "hi" ? "अज्ञात" : "Unknown"}: ${question}`
    : question;
}

/**
 * Preferred display form for a clarification. When the model produced a
 * presentation in the selected language, its wording is what the citizen
 * sees; otherwise fall back to the local stock translation. The canonical
 * clarification string (including any "Unknown:" prefix) remains the state
 * identity and is never replaced by localized text.
 */
export function clarificationDisplay(
  need: InformationNeed | undefined,
  clarification: string,
  language: Language,
): string {
  const index = need?.unresolvedClarifications.indexOf(clarification) ?? -1;
  const presentationText =
    index >= 0 &&
    need?.presentation?.language === language &&
    need.presentation.unresolvedClarifications[index]
      ? need.presentation.unresolvedClarifications[index]
      : undefined;
  if (presentationText !== undefined) {
    return isUnknownClarification(clarification)
      ? `${language === "hi" ? "अज्ञात" : "Unknown"}: ${presentationText}`
      : presentationText;
  }
  return localizeClarification(clarification, language);
}

export function localizeDisclosureEntry(
  entry: DisclosureEntry,
  language: Language,
): DisclosureEntry {
  if (language === "en") return entry;
  return {
    ...entry,
    label: translateText(entry.label, language),
    disclosure: translateText(entry.disclosure, language),
  };
}

export function localizeNeed(
  need: InformationNeed,
  language: Language,
): InformationNeed {
  if (need.presentation?.language === language) {
    return {
      ...need,
      canonicalNeed: need.presentation.canonicalNeed,
      measure: need.presentation.measure,
      geography: need.presentation.geography,
      period: need.presentation.period,
      breakdown: need.presentation.breakdown,
      informationHolder: need.presentation.informationHolder,
      unresolvedClarifications:
        need.presentation.unresolvedClarifications.slice(),
    };
  }
  if (language === "en") return need;
  return {
    ...need,
    canonicalNeed: translateText(need.canonicalNeed, language),
    measure: translateText(need.measure, language),
    geography: translateText(need.geography, language),
    period: translateText(need.period, language),
    breakdown: translateText(need.breakdown, language),
    informationHolder: translateText(need.informationHolder, language),
    unresolvedClarifications: need.unresolvedClarifications.map((item) =>
      localizeClarification(item, language),
    ),
  };
}

export function localizeMessage(message: string, language: Language): string {
  if (language === "en") return message;
  if (message === "Use demo OTP 123456. No SMS was sent.")
    return "डेमो OTP 123456 डालें। कोई SMS नहीं भेजा गया।";
  if (message === "Only the fictional demo profile is accepted.")
    return "केवल काल्पनिक डेमो प्रोफ़ाइल स्वीकार की जाती है।";
  if (message === "Review and confirm the RTI details before payment.")
    return "भुगतान से पहले RTI का विवरण देखें और पुष्टि करें।";
  if (message === "Only the simulated ₹10 demo payment is accepted.")
    return "केवल अनुकरण किया गया ₹10 डेमो भुगतान स्वीकार है।";
  if (message === "Explicit confirmation is required.")
    return "स्पष्ट पुष्टि आवश्यक है।";
  if (message.includes("characters. Remove")) {
    const match = message.match(
      /This route accepts (\d+) characters\. Remove (\d+) characters/,
    );
    return match
      ? `यह मार्ग ${match[1]} अक्षर स्वीकार करता है। जारी रखने के लिए ${match[2]} अक्षर हटाएँ।`
      : message;
  }
  if (message === "Newlines are not permitted by this route profile.")
    return "इस मार्ग प्रोफ़ाइल में नई पंक्तियाँ स्वीकार नहीं हैं।";
  if (message === "The RTI draft is not tied to the confirmed question.")
    return "RTI ड्राफ्ट पुष्ट सवाल से जुड़ा नहीं है।";
  if (
    message ===
    "The government authority in the RTI draft does not match the selected RTI channel."
  )
    return "RTI ड्राफ्ट में दिया गया सरकारी प्राधिकरण चुने गए RTI चैनल से मेल नहीं खाता।";
  if (message === "The RTI channel does not match the checked channel.")
    return "RTI चैनल जाँचे गए चैनल से मेल नहीं खाता।";
  if (
    message ===
    "Only the verified Central Filing Route is available for Demo Submission."
  )
    return "डेमो सबमिशन के लिए केवल सत्यापित केंद्रीय फाइलिंग मार्ग उपलब्ध है।";
  if (message === "Identity fields such as Aadhaar and PAN are not accepted.")
    return "आधार और PAN जैसे पहचान विवरण स्वीकार नहीं किए जाते।";
  if (
    message ===
    "We couldn’t interpret your request just now. Nothing was submitted."
  )
    return "अभी आपका अनुरोध समझा नहीं जा सका। कुछ भी जमा नहीं किया गया।";
  if (message === "We couldn’t check the prototype snapshot just now.")
    return "अभी प्रोटोटाइप स्नैपशॉट की जाँच नहीं हो सकी।";
  if (
    message ===
    "Change and reconfirm the Information Need before rechecking this challenged source."
  )
    return "इस चुनौती दिए गए स्रोत को फिर से जाँचने से पहले सूचना-ज़रूरत बदलकर उसकी पुष्टि करें।";
  if (
    message ===
    "This route accepts 3000 characters. Remove 1 characters to continue."
  )
    return "यह मार्ग 3000 अक्षर स्वीकार करता है। जारी रखने के लिए 1 अक्षर हटाएँ।";
  return translateText(message, language);
}

export function localizeFilingDraft(text: string, language: Language): string {
  const railwayEnglish =
    "Please provide the following records concerning maintenance of lifts and escalators at New Delhi Railway Station during financial year 2024–25: 1. The expenditure statement or relevant ledger extract showing the total amount spent on maintenance of lifts and escalators. 2. Copies of the applicable work orders or contracts, including contractor names and contract values. Please provide the records in electronic form. If these records are held by another public authority, please transfer the application as applicable and inform the applicant.";
  const railwayHindi =
    "कृपया वित्तीय वर्ष 2024–25 के दौरान नई दिल्ली रेलवे स्टेशन पर लिफ्ट और एस्केलेटर के रखरखाव से संबंधित ये रिकॉर्ड उपलब्ध कराएँ: 1. लिफ्ट और एस्केलेटर के रखरखाव पर खर्च की कुल राशि दिखाने वाला व्यय विवरण या संबंधित लेजर अंश। 2. लागू कार्यादेश या अनुबंधों की प्रतियाँ, जिनमें ठेकेदारों के नाम और अनुबंध मूल्य शामिल हों। रिकॉर्ड इलेक्ट्रॉनिक रूप में उपलब्ध कराएँ। यदि ये रिकॉर्ड किसी दूसरे लोक प्राधिकरण के पास हैं, तो लागू नियमों के अनुसार आवेदन स्थानांतरित करके आवेदक को सूचित करें।";
  if (language === "en" && text === railwayHindi) return railwayEnglish;
  if (language === "en") return text;
  if (text === railwayEnglish) return railwayHindi;
  return text;
}

export function localizeResolution(
  result: RenderableResolution,
  language: Language,
): RenderableResolution {
  if (language === "en") return result;
  const modelAuthored = result.narration === "verified_model";
  return {
    ...result,
    headline: modelAuthored
      ? result.headline
      : translateText(result.headline, language),
    meaning: modelAuthored
      ? result.meaning
      : translateText(result.meaning, language),
    evidenceStatus: modelAuthored
      ? result.evidenceStatus
      : translateText(result.evidenceStatus, language),
    gaps: modelAuthored
      ? result.gaps.slice()
      : result.gaps.map((gap) => translateText(gap, language)),
    searchScope: modelAuthored
      ? result.searchScope
      : translateText(result.searchScope, language),
    recommendedAction: modelAuthored
      ? result.recommendedAction
      : translateText(result.recommendedAction, language),
    evidence: result.evidence.map((item) => ({
      ...item,
      sourceTitle: translateText(item.sourceTitle, language),
      publisher: translateText(item.publisher, language),
      applicablePeriod: translateText(item.applicablePeriod, language),
      extract: translateText(item.extract, language),
      syntheticDisclosure: item.syntheticDisclosure
        ? translateText(item.syntheticDisclosure, language)
        : item.syntheticDisclosure,
    })),
    calculation: result.calculation
      ? {
          ...result.calculation,
          operation: translateText(result.calculation.operation, language),
          filters: result.calculation.filters.map((filter) =>
            translateText(filter, language),
          ),
          caveat: translateText(result.calculation.caveat, language),
        }
      : result.calculation,
    resultTable: result.resultTable
      ? {
          ...result.resultTable,
          columns: result.resultTable.columns.map((column) => ({
            ...column,
            label: localizeResultColumnLabel(column.label, language),
          })),
        }
      : result.resultTable,
    serviceRoute: result.serviceRoute
      ? {
          ...result.serviceRoute,
          purpose: translateText(result.serviceRoute.purpose, language),
        }
      : result.serviceRoute,
    researchFinding: result.researchFinding
      ? {
          ...result.researchFinding,
          headline: translateText(result.researchFinding.headline, language),
          evidenceStatus: translateText(
            result.researchFinding.evidenceStatus,
            language,
          ),
          evidence: result.researchFinding.evidence.map((item) => ({
            ...item,
            sourceTitle: translateText(item.sourceTitle, language),
            publisher: translateText(item.publisher, language),
            applicablePeriod: translateText(item.applicablePeriod, language),
            extract: translateText(item.extract, language),
            syntheticDisclosure: item.syntheticDisclosure
              ? translateText(item.syntheticDisclosure, language)
              : item.syntheticDisclosure,
          })),
        }
      : result.researchFinding,
    formalResponseReason: result.formalResponseReason
      ? translateText(result.formalResponseReason, language)
      : result.formalResponseReason,
  };
}
