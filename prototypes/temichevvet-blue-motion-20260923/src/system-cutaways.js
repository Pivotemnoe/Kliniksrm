// Marker positions are percentages of the versioned, illustrated cutaway assets.
// They are visual teaching cues, not coordinates from a patient's image.
export const systemCutaways = {
  heart: {
    image: "/assets/story-heart-cutaway-v1.webp",
    aspect: "1224 / 1285",
    openLabel: "Сердце изнутри",
    items: [
      { points: [[34, 39]], size: 24 }, // Right atrium, viewer's left.
      { points: [[38, 75]], size: 29 }, // Right ventricle.
      { points: [[77, 41]], size: 24 }, // Left atrium, viewer's right.
      { points: [[75, 75]], size: 30 }, // Left ventricle.
    ],
    valves: [
      { name: "Трёхстворчатый клапан", text: "Между правым предсердием и правым желудочком. Помогает крови двигаться в одном направлении.", points: [[35, 57]], size: 16 },
      { name: "Клапан лёгочной артерии", text: "На выходе из правого желудочка к лёгочной артерии. На модели его положение показано условно.", points: [[59, 41]], size: 16 },
      { name: "Митральный клапан", text: "Между левым предсердием и левым желудочком. Направляет кровь дальше в левый желудочек.", points: [[76, 55]], size: 16 },
      { name: "Аортальный клапан", text: "На выходе из левого желудочка в аорту. На модели его положение показано условно.", points: [[55, 32]], size: 16 },
    ],
  },
  breathing: {
    image: "/assets/story-breathing-cutaway-v1.webp",
    aspect: "1312 / 1199",
    openLabel: "Путь воздуха изнутри",
    items: [
      { points: [[50, 19]], size: 14 },
      { points: [[51, 42]], size: 18 },
      { points: [[28, 62], [73, 60]], size: 30 },
      { points: [[85, 81]], size: 25 },
    ],
  },
  urinary: {
    image: "/assets/story-urinary-cutaway-v1.webp",
    aspect: "1024 / 1536",
    openLabel: "Путь мочи изнутри",
    items: [
      { points: [[24, 20], [75, 20]], size: 24 },
      { points: [[35, 47], [68, 47]], size: 15 },
      { points: [[50, 74]], size: 26 },
      { points: [[50, 90]], size: 13 },
    ],
  },
  ear: {
    image: "/assets/story-ear-cutaway-v1.webp",
    aspect: "1536 / 1024",
    openLabel: "Ухо изнутри",
    items: [
      { points: [[25, 31]], size: 25 },
      { points: [[43, 54]], size: 19 },
      { points: [[62, 60]], size: 18 },
      { points: [[82, 48]], size: 23 },
    ],
  },
};
