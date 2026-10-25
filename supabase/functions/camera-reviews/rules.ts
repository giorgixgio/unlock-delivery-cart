export const REVIEW_BATCH_LIMIT = 50;
export function normalizeReviewPhone(phone:string):string|null {const digits=phone.replace(/\D/g,'').slice(-9);return /^5\d{8}$/.test(digits)?`995${digits}`:null;}
export function reviewSmsMessage(link:string):string {return `გმადლობთ შეკვეთისთვის! როგორ მოგეწონათ მინი კამერა? შეაფასეთ 10 წამში: ${link}`;}
export function reviewVisible(status:string,source:string,preview:boolean):boolean {return status==='approved'||(preview&&status==='demo'&&source==='demo');}
export function reviewVerified(source:string,delivered:boolean):boolean {return source==='order_link'&&delivered;}
export function showTodayCount(count:number):boolean{return count>=10;}
export function showStockCount(count:number|null):boolean{return count!==null&&count>0;}