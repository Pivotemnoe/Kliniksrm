// Canonical public catalogue shared by the grooming site and gateway. No client-supplied labels.
export const GROOMING_CATALOG_VERSION = '2026-10-19-v2';
export const GROOMING_BREEDS = [
  {
    "id": "maltipoo",
    "name": "Мальтипу",
    "group": "Кудрявая шерсть",
    "image": "/assets/v1/maltipoo.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Округлая форма",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Естественный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Практичная длина",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "york",
    "name": "Йоркширский терьер",
    "group": "Длинная шерсть",
    "image": "/assets/v1/york.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Длинная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Повседневный образ",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Короткий корпус",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "poodle-mini",
    "name": "Карликовый пудель",
    "group": "Кудрявая шерсть",
    "image": "/assets/v1/poodle-mini.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Округлая форма",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Породный силуэт",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Практичная длина",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "bichon",
    "name": "Бишон фризе",
    "group": "Кудрявая шерсть",
    "image": "/assets/v1/bichon.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Объёмная форма",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкий контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Повседневный образ",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "maltese",
    "name": "Мальтийская болонка",
    "group": "Длинная шерсть",
    "image": "/assets/v1/maltese.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Длинная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкая форма",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Практичная длина",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "shih-tzu",
    "name": "Ши-тцу",
    "group": "Длинная шерсть",
    "image": "/assets/v1/shih-tzu.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Длинная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Округлая форма",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Повседневный образ",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "poodle-standard",
    "name": "Большой пудель",
    "group": "Кудрявая шерсть",
    "image": "/assets/v1/poodle-standard.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Мягкая форма",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Породный силуэт",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Практичная длина",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "large",
    "defaultServiceId": "haircut"
  },
  {
    "id": "pomeranian",
    "name": "Померанский шпиц",
    "group": "Двойная шерсть",
    "image": "/assets/v1/pomeranian.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Аккуратный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Объёмная шерсть",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "coat"
  },
  {
    "id": "pekingese",
    "name": "Пекинес",
    "group": "Двойная шерсть",
    "image": "/assets/v1/pekingese.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Аккуратный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Ухоженный силуэт",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "coat"
  },
  {
    "id": "cocker",
    "name": "Английский кокер-спаниель",
    "group": "Длинная шерсть",
    "image": "/assets/v1/cocker.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Повседневный образ",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратный контур",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "haircut"
  },
  {
    "id": "schnauzer",
    "name": "Цвергшнауцер",
    "group": "Жёсткая шерсть",
    "image": "/assets/v1/schnauzer.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкий контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратная борода",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "westie",
    "name": "Вест-хайленд-уайт-терьер",
    "group": "Жёсткая шерсть",
    "image": "/assets/v1/westie.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Округлая форма",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Естественный контур",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "scottie",
    "name": "Скотч-терьер",
    "group": "Жёсткая шерсть",
    "image": "/assets/v1/scottie.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Повседневный образ",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратный контур",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "havanese",
    "name": "Гаванский бишон",
    "group": "Длинная шерсть",
    "image": "/assets/v1/havanese.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Длинная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкая форма",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Практичная длина",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "bolonka",
    "name": "Русская цветная болонка",
    "group": "Кудрявая шерсть",
    "image": "/assets/v1/bolonka.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Объёмная форма",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкий контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Повседневный образ",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "lhasa",
    "name": "Лхаса апсо",
    "group": "Длинная шерсть",
    "image": "/assets/v1/lhasa.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Длинная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкая форма",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Практичная длина",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "haircut"
  },
  {
    "id": "bedlington",
    "name": "Бедлингтон-терьер",
    "group": "Кудрявая шерсть",
    "image": "/assets/v1/bedlington.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Мягкая форма",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Повседневный образ",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "haircut"
  },
  {
    "id": "papillon",
    "name": "Папильон",
    "group": "Длинная шерсть",
    "image": "/assets/v1/papillon.webp",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Аккуратный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Ухоженный силуэт",
        "frame": 2
      }
    ],
    "species": "dog",
    "size": "small",
    "defaultServiceId": "coat"
  },
  {
    "id": "husky",
    "name": "Сибирский хаски",
    "group": "Двойная шерсть",
    "image": "/assets/v2/husky.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "akita-inu",
    "name": "Акита-ину",
    "group": "Двойная шерсть",
    "image": "/assets/v2/akita-inu.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "american-akita",
    "name": "Американская акита",
    "group": "Двойная шерсть",
    "image": "/assets/v2/american-akita.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "shiba-inu",
    "name": "Сиба-ину",
    "group": "Двойная шерсть",
    "image": "/assets/v2/shiba-inu.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "bernese",
    "name": "Бернский зенненхунд",
    "group": "Длинная двойная шерсть",
    "image": "/assets/v2/bernese.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "giant-schnauzer",
    "name": "Ризеншнауцер",
    "group": "Жёсткая шерсть",
    "image": "/assets/v2/giant-schnauzer.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "haircut",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Повседневный образ",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратная борода",
        "frame": 2
      }
    ]
  },
  {
    "id": "standard-schnauzer",
    "name": "Миттельшнауцер",
    "group": "Жёсткая шерсть",
    "image": "/assets/v2/standard-schnauzer.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "haircut",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Повседневный образ",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратная борода",
        "frame": 2
      }
    ]
  },
  {
    "id": "golden-retriever",
    "name": "Золотистый ретривер",
    "group": "Длинная двойная шерсть",
    "image": "/assets/v2/golden-retriever.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "labrador",
    "name": "Лабрадор-ретривер",
    "group": "Короткая двойная шерсть",
    "image": "/assets/v2/labrador.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "samoyed",
    "name": "Самоед",
    "group": "Двойная шерсть",
    "image": "/assets/v2/samoyed.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "malamute",
    "name": "Аляскинский маламут",
    "group": "Двойная шерсть",
    "image": "/assets/v2/malamute.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "newfoundland",
    "name": "Ньюфаундленд",
    "group": "Длинная двойная шерсть",
    "image": "/assets/v2/newfoundland.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "leonberger",
    "name": "Леонбергер",
    "group": "Длинная двойная шерсть",
    "image": "/assets/v2/leonberger.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "saint-bernard",
    "name": "Сенбернар",
    "group": "Длинная шерсть",
    "image": "/assets/v2/saint-bernard.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "rough-collie",
    "name": "Длинношёрстный колли",
    "group": "Длинная двойная шерсть",
    "image": "/assets/v2/rough-collie.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "australian-shepherd",
    "name": "Австралийская овчарка",
    "group": "Длинная двойная шерсть",
    "image": "/assets/v2/australian-shepherd.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "border-collie",
    "name": "Бордер-колли",
    "group": "Двойная шерсть",
    "image": "/assets/v2/border-collie.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "chow-chow",
    "name": "Чау-чау",
    "group": "Двойная шерсть",
    "image": "/assets/v2/chow-chow.webp",
    "species": "dog",
    "size": "medium",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "german-shepherd",
    "name": "Немецкая овчарка",
    "group": "Двойная шерсть",
    "image": "/assets/v2/german-shepherd.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "airedale",
    "name": "Эрдельтерьер",
    "group": "Жёсткая шерсть",
    "image": "/assets/v2/airedale.webp",
    "species": "dog",
    "size": "large",
    "defaultServiceId": "haircut",
    "styles": [
      {
        "id": "shape",
        "name": "Породный силуэт",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Повседневный образ",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратная борода",
        "frame": 2
      }
    ]
  },
  {
    "id": "maine-coon",
    "name": "Мейн-кун",
    "group": "Длинная шерсть",
    "image": "/assets/v2/maine-coon.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "persian",
    "name": "Персидская кошка",
    "group": "Длинная шерсть",
    "image": "/assets/v2/persian.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "british-shorthair",
    "name": "Британская короткошёрстная",
    "group": "Короткая шерсть",
    "image": "/assets/v2/british-shorthair.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "scottish-fold",
    "name": "Шотландская вислоухая",
    "group": "Короткая шерсть",
    "image": "/assets/v2/scottish-fold.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "siberian-cat",
    "name": "Сибирская кошка",
    "group": "Длинная шерсть",
    "image": "/assets/v2/siberian-cat.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "ragdoll",
    "name": "Рэгдолл",
    "group": "Длинная шерсть",
    "image": "/assets/v2/ragdoll.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "domestic-shorthair",
    "name": "Домашняя короткошёрстная",
    "group": "Короткая шерсть",
    "image": "/assets/v2/domestic-shorthair.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная шерсть",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженный контур",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  },
  {
    "id": "domestic-longhair",
    "name": "Домашняя длинношёрстная",
    "group": "Длинная шерсть",
    "image": "/assets/v2/domestic-longhair.webp",
    "species": "cat",
    "size": null,
    "defaultServiceId": "coat",
    "styles": [
      {
        "id": "shape",
        "name": "Естественная длина",
        "frame": 0
      },
      {
        "id": "contour",
        "name": "Ухоженная шерсть",
        "frame": 1
      },
      {
        "id": "everyday",
        "name": "Аккуратные детали",
        "frame": 2
      }
    ]
  }
] as const;
export const GROOMING_LOOK_COUNT = GROOMING_BREEDS.reduce((total, breed) => total + breed.styles.length, 0);
export const GROOMING_SERVICES = [
 {id:'haircut',name:'Стрижка и уход',description:'Обсудим форму, длину и уход за шерстью.'},
 {id:'hygiene',name:'Гигиенический уход',description:'Уточним состав ухода для вашего питомца.'},
 {id:'coat',name:'Уход за шерстью',description:'Обсудим мытьё, вычёсывание и особенности шерсти.'},
 {id:'first',name:'Первое знакомство',description:'Поможем подготовиться к первому визиту.'}
] as const;
export function groomingLook(id: string) {
 const [breedId, styleId, extra] = id.split(':');
 if (extra !== undefined) return null;
 const breed = GROOMING_BREEDS.find(b => b.id === breedId);
 const style = breed?.styles.find(s => s.id === styleId);
 return breed && style ? {id, breedId:breed.id, breedName:breed.name, species:breed.species, size:breed.size, styleId:style.id, styleName:style.name, image:breed.image, frame:style.frame} : null;
}
