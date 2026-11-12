const isoDatePattern=/^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value){
  if(typeof value!=="string"||!isoDatePattern.test(value))return false;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

export function previousBangkokDate(today){
  if(!isRealDate(today))throw new RangeError("Invalid Bangkok date.");
  return new Date(Date.parse(`${today}T00:00:00.000Z`)-86400000).toISOString().slice(0,10);
}

export function isOvertimeDateAllowed(value,today){
  if(!isRealDate(value)||!isRealDate(today))return false;
  return value>=previousBangkokDate(today)&&value<=today;
}