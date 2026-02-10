// Onway courier delivery coverage — regions, cities, villages
// This is a PRIMARY suggestion source, not an exclusive list.
// Valid addresses may exist outside this dataset.

export interface OnwayLocation {
  name: string;       // Georgian name
  latin?: string;     // Latin transliteration for matching
  region?: string;    // Parent region
  type: "region" | "city" | "village";
  popular?: boolean;  // High-traffic locations
}

export const ONWAY_LOCATIONS: OnwayLocation[] = [
  // ===== Major cities =====
  { name: "თბილისი", latin: "tbilisi", type: "city", region: "თბილისი", popular: true },
  { name: "ბათუმი", latin: "batumi", type: "city", region: "აჭარა", popular: true },
  { name: "ქუთაისი", latin: "kutaisi", type: "city", region: "იმერეთი", popular: true },
  { name: "რუსთავი", latin: "rustavi", type: "city", region: "ქვემო ქართლი", popular: true },
  { name: "გორი", latin: "gori", type: "city", region: "შიდა ქართლი", popular: true },
  { name: "ზუგდიდი", latin: "zugdidi", type: "city", region: "სამეგრელო", popular: true },
  { name: "ფოთი", latin: "poti", type: "city", region: "სამეგრელო", popular: true },
  { name: "ხაშური", latin: "khashuri", type: "city", region: "შიდა ქართლი", popular: true },
  { name: "სამტრედია", latin: "samtredia", type: "city", region: "იმერეთი", popular: true },
  { name: "სენაკი", latin: "senaki", type: "city", region: "სამეგრელო", popular: true },
  { name: "ოზურგეთი", latin: "ozurgeti", type: "city", region: "გურია" },
  { name: "ტელავი", latin: "telavi", type: "city", region: "კახეთი" },
  { name: "ახალციხე", latin: "akhaltsikhe", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "მარნეული", latin: "marneuli", type: "city", region: "ქვემო ქართლი", popular: true },
  { name: "ქობულეთი", latin: "kobuleti", type: "city", region: "აჭარა", popular: true },
  { name: "წყალტუბო", latin: "tskaltubo", type: "city", region: "იმერეთი" },
  { name: "საგარეჯო", latin: "sagarejo", type: "city", region: "კახეთი" },
  { name: "გარდაბანი", latin: "gardabani", type: "city", region: "ქვემო ქართლი" },
  { name: "ბოლნისი", latin: "bolnisi", type: "city", region: "ქვემო ქართლი" },
  { name: "ლაგოდეხი", latin: "lagodekhi", type: "city", region: "კახეთი" },
  { name: "დუშეთი", latin: "dusheti", type: "city", region: "მცხეთა-მთიანეთი" },
  { name: "მესტია", latin: "mestia", type: "city", region: "სვანეთი" },
  { name: "ბაღდათი", latin: "baghdati", type: "city", region: "იმერეთი" },
  { name: "მარტვილი", latin: "martvili", type: "city", region: "სამეგრელო" },
  { name: "ზესტაფონი", latin: "zestaponi", type: "city", region: "იმერეთი" },
  { name: "ჭიათურა", latin: "chiatura", type: "city", region: "იმერეთი" },
  { name: "თერჯოლა", latin: "terjola", type: "city", region: "იმერეთი" },
  { name: "ხონი", latin: "khoni", type: "city", region: "იმერეთი" },
  { name: "ვანი", latin: "vani", type: "city", region: "იმერეთი" },
  { name: "ახალქალაქი", latin: "akhalkalaki", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "ახმეტა", latin: "akhmeta", type: "city", region: "კახეთი" },
  { name: "გურჯაანი", latin: "gurjaani", type: "city", region: "კახეთი" },
  { name: "სიღნაღი", latin: "sighnaghi", type: "city", region: "კახეთი" },
  { name: "დედოფლისწყარო", latin: "dedoplistskaro", type: "city", region: "კახეთი" },
  { name: "ყვარელი", latin: "kvareli", type: "city", region: "კახეთი" },
  { name: "მცხეთა", latin: "mtskheta", type: "city", region: "მცხეთა-მთიანეთი", popular: true },
  { name: "კასპი", latin: "kaspi", type: "city", region: "შიდა ქართლი" },
  { name: "ქარელი", latin: "kareli", type: "city", region: "შიდა ქართლი" },
  { name: "წნორი", latin: "tsnori", type: "city", region: "კახეთი" },
  { name: "ლანჩხუთი", latin: "lanchkhuti", type: "city", region: "გურია" },
  { name: "ჩოხატაური", latin: "chokhatauri", type: "city", region: "გურია" },
  { name: "ხელვაჩაური", latin: "khelvachauri", type: "city", region: "აჭარა" },
  { name: "შუახევი", latin: "shuakhevi", type: "city", region: "აჭარა" },
  { name: "ხულო", latin: "khulo", type: "city", region: "აჭარა" },
  { name: "ქედა", latin: "keda", type: "city", region: "აჭარა" },
  { name: "ტყიბული", latin: "tkibuli", type: "city", region: "იმერეთი" },
  { name: "ბორჯომი", latin: "borjomi", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "ვალე", latin: "vale", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "ნინოწმინდა", latin: "ninotsminda", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "ადიგენი", latin: "adigeni", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "ასპინძა", latin: "aspindza", type: "city", region: "სამცხე-ჯავახეთი" },
  { name: "თეთრიწყარო", latin: "tetritskaro", type: "city", region: "ქვემო ქართლი" },
  { name: "დმანისი", latin: "dmanisi", type: "city", region: "ქვემო ქართლი" },
  { name: "წალკა", latin: "tsalka", type: "city", region: "ქვემო ქართლი" },
  { name: "თიანეთი", latin: "tianeti", type: "city", region: "მცხეთა-მთიანეთი" },
  { name: "ყაზბეგი", latin: "kazbegi", type: "city", region: "მცხეთა-მთიანეთი" },
  { name: "აბაშა", latin: "abasha", type: "city", region: "სამეგრელო" },
  { name: "ხობი", latin: "khobi", type: "city", region: "სამეგრელო" },
  { name: "ჩხოროწყუ", latin: "chkhorotsku", type: "city", region: "სამეგრელო" },
  { name: "წალენჯიხა", latin: "tsalenjikha", type: "city", region: "სამეგრელო" },
  { name: "ამბროლაური", latin: "ambrolauri", type: "city", region: "რაჭა-ლეჩხუმი" },
  { name: "ონი", latin: "oni", type: "city", region: "რაჭა-ლეჩხუმი" },
  { name: "ცაგერი", latin: "tsageri", type: "city", region: "რაჭა-ლეჩხუმი" },
  { name: "ლენტეხი", latin: "lentekhi", type: "city", region: "რაჭა-ლეჩხუმი" },

  // ===== Regions =====
  { name: "თბილისი", latin: "tbilisi", type: "region" },
  { name: "აჭარა", latin: "adjara", type: "region" },
  { name: "იმერეთი", latin: "imereti", type: "region" },
  { name: "კახეთი", latin: "kakheti", type: "region" },
  { name: "სამეგრელო", latin: "samegrelo", type: "region" },
  { name: "გურია", latin: "guria", type: "region" },
  { name: "შიდა ქართლი", latin: "shida kartli", type: "region" },
  { name: "ქვემო ქართლი", latin: "kvemo kartli", type: "region" },
  { name: "მცხეთა-მთიანეთი", latin: "mtskheta mtianeti", type: "region" },
  { name: "სამცხე-ჯავახეთი", latin: "samtskhe javakheti", type: "region" },
  { name: "რაჭა-ლეჩხუმი", latin: "racha lechkhumi", type: "region" },
  { name: "სვანეთი", latin: "svaneti", type: "region" },

  // ===== Tbilisi districts (common address prefixes) =====
  { name: "ვაკე", latin: "vake", type: "village", region: "თბილისი" },
  { name: "საბურთალო", latin: "saburtalo", type: "village", region: "თბილისი" },
  { name: "დიდუბე", latin: "didube", type: "village", region: "თბილისი" },
  { name: "გლდანი", latin: "gldani", type: "village", region: "თბილისი" },
  { name: "ნაძალადევი", latin: "nadzaladevi", type: "village", region: "თბილისი" },
  { name: "ისანი", latin: "isani", type: "village", region: "თბილისი" },
  { name: "სამგორი", latin: "samgori", type: "village", region: "თბილისი" },
  { name: "ჩუღურეთი", latin: "chughureti", type: "village", region: "თბილისი" },
  { name: "კრწანისი", latin: "krtsanisi", type: "village", region: "თბილისი" },
  { name: "მთაწმინდა", latin: "mtatsminda", type: "village", region: "თბილისი" },
  { name: "ძველი თბილისი", latin: "old tbilisi", type: "village", region: "თბილისი" },
  { name: "ავლაბარი", latin: "avlabari", type: "village", region: "თბილისი" },
  { name: "ვარკეთილი", latin: "varketili", type: "village", region: "თბილისი" },
  { name: "თემქა", latin: "temka", type: "village", region: "თბილისი" },
  { name: "დიღომი", latin: "dighomi", type: "village", region: "თბილისი" },
  { name: "ლილო", latin: "lilo", type: "village", region: "თბილისი" },
  { name: "ავჭალა", latin: "avchala", type: "village", region: "თბილისი" },
];

/** Get all city-type locations for city input suggestions */
export function getOnwayCities(): OnwayLocation[] {
  return ONWAY_LOCATIONS.filter(l => l.type === "city" || l.type === "region");
}

/** Get all locations (for address context — districts, villages) */
export function getOnwayAddressLocations(): OnwayLocation[] {
  return ONWAY_LOCATIONS.filter(l => l.type === "village");
}
