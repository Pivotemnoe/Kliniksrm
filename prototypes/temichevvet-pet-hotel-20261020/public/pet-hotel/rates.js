export function minimumRoomRate(rooms, species, fallback) {
  const rates=(rooms||[]).filter(room=>room.isActive!==false&&(!species||room.species===species))
    .map(room=>room.dailyRate)
    .filter(value=>typeof value==='number'||(typeof value==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())))
    .map(Number).filter(rate=>Number.isFinite(rate)&&rate>=0);
  return rates.length?Math.min(...rates):Number(fallback);
}
