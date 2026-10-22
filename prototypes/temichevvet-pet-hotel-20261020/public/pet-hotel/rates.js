export function minimumRoomRate(rooms, species, fallback) {
  const rates=(rooms||[]).filter(room=>room.isActive!==false&&(!species||room.species===species))
    .map(room=>Number(room.dailyRate)).filter(rate=>Number.isFinite(rate)&&rate>0);
  return rates.length?Math.min(...rates):Number(fallback);
}
