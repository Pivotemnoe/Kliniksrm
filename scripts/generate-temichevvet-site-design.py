from __future__ import annotations

import base64
import html
import io
import math
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/product/temichevvet-site/assets"
PDF_OUT = ROOT / "output/pdf/TemichevVet-site-v1-plan.pdf"
SVG_OUT = ROOT / "docs/product/temichevvet-site/TemichevVet_Figma_Import_Board.svg"

PAGE_W, PAGE_H = landscape(A3)

NAVY = colors.HexColor("#07162F")
BLUE = colors.HexColor("#0B57D0")
BLUE_2 = colors.HexColor("#1967D2")
BLUE_SOFT = colors.HexColor("#F3F8FF")
GRAY_50 = colors.HexColor("#F8FAFC")
GRAY_100 = colors.HexColor("#F1F5F9")
GRAY_200 = colors.HexColor("#E2E8F0")
GRAY_400 = colors.HexColor("#94A3B8")
GRAY_600 = colors.HexColor("#475569")
GREEN = colors.HexColor("#159A5B")
RED = colors.HexColor("#D64545")
WHITE = colors.white


ROUTES = [
    ("/", "Общая главная TemichevVet", "Оценить состояние питомца", "Общий бренд"),
    ("/doctor/", "Константин Темичев", "Начать оценку состояния", "Общий бренд"),
    ("/health/", "Здоровье питомца", "Оценить состояние", "Здоровье"),
    ("/health/assessment/", "Старт оценки состояния", "Начать", "Здоровье"),
    ("/health/library/", "База знаний", "Найти материал", "Здоровье"),
    ("/health/library/{slug}/", "Статья врача", "Оценить состояние", "Здоровье"),
    ("/cabinet/", "Вход в личный кабинет", "Войти по приглашению", "Кабинет"),
    ("/store/", "Каталог магазина", "В корзину", "Магазин"),
    ("/store/{slug}/", "Карточка товара", "В корзину", "Магазин"),
    ("/cart/", "Корзина", "Оформить заказ", "Магазин"),
    ("/checkout/", "Оформление заказа", "Подтвердить заказ", "Магазин"),
    ("/for-clinics/", "TemichevVet CRM", "Запросить демонстрацию", "Для ветклиник"),
    ("/for-clinics/demo/", "Заявка на демонстрацию", "Отправить заявку", "Для ветклиник"),
    ("/armavir/", "Клиника в Армавире", "Записаться на приём", "Армавир"),
    ("/armavir/appointment/", "Онлайн-запись", "Отправить заявку", "Армавир"),
    ("/armavir/services/", "Все услуги", "Выбрать услугу", "Армавир"),
    ("/armavir/services/{slug}/", "Страница услуги", "Записаться", "Армавир"),
    ("/armavir/grooming/", "Груминг", "Записаться на груминг", "Армавир"),
    ("/armavir/pet-hotel/", "Зоогостиница", "Узнать наличие мест", "Армавир"),
    ("/armavir/team/", "Команда", "Выбрать врача", "Армавир"),
    ("/armavir/contacts/", "Контакты и филиалы", "Построить маршрут", "Армавир"),
    ("/search/", "Общий поиск", "Найти", "Сервис"),
    ("/support/", "Связь и помощь", "Написать сообщение", "Сервис"),
    ("/booking/success/", "Заявка принята", "Вернуться на главную", "Сервис"),
    ("/privacy/", "Политика конфиденциальности", "Оглавление", "Право"),
    ("/personal-data-consent/", "Согласие на обработку данных", "Скачать", "Право"),
    ("/404/", "Страница не найдена", "На главную", "Сервис"),
]

PHOTO_MAP = [
    ("IMG_6984.jpg", "Главная: врач с котом"),
    ("IMG_6989.jpg", "О враче: квалификация"),
    ("IMG_6990 2.jpg", "Экспертный портрет"),
    ("IMG_6988.jpg", "Осмотр и доверие"),
    ("IMG_6986.jpg", "Уход и восстановление"),
    ("IMG_6981.jpg", "Клиника и ветаптека"),
    ("IMG_6976.jpg", "Врачебная работа"),
    ("IMG_7110.JPG", "Магазин"),
    ("IMG_7070.JPG", "Объясняющий блок"),
    ("IMG_7069.JPG", "Экспертная подсказка"),
    ("IMG_7046.JPG", "Лаборатория"),
    ("IMG_7033.JPG", "FAQ и коммуникация"),
]


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("TV-Regular", "/System/Library/Fonts/Supplemental/Arial.ttf"))
    pdfmetrics.registerFont(TTFont("TV-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))


def wrap(text: str, max_chars: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = word if not current else f"{current} {word}"
        if len(test) <= max_chars:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text(c: canvas.Canvas, text: str, x: float, y: float, size: float = 12,
              color=NAVY, bold: bool = False, max_chars: int | None = None,
              leading: float | None = None) -> float:
    c.setFont("TV-Bold" if bold else "TV-Regular", size)
    c.setFillColor(color)
    lead = leading or size * 1.35
    lines = wrap(text, max_chars) if max_chars else [text]
    yy = y
    for line in lines:
        c.drawString(x, yy, line)
        yy -= lead
    return yy


def page_title(c: canvas.Canvas, section: str, title: str, subtitle: str = "") -> None:
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(BLUE)
    c.roundRect(42, PAGE_H - 78, 132, 26, 13, stroke=0, fill=1)
    draw_text(c, section.upper(), 56, PAGE_H - 70, 10, WHITE, True)
    draw_text(c, title, 42, PAGE_H - 118, 28, NAVY, True)
    if subtitle:
        draw_text(c, subtitle, 42, PAGE_H - 148, 12, GRAY_600)
    c.setStrokeColor(GRAY_200)
    c.line(42, PAGE_H - 165, PAGE_W - 42, PAGE_H - 165)


def page_footer(c: canvas.Canvas, number: int) -> None:
    c.setStrokeColor(GRAY_200)
    c.line(42, 34, PAGE_W - 42, 34)
    draw_text(c, "TemichevVet — первичный дизайн-план v1", 42, 18, 9, GRAY_600)
    draw_text(c, str(number), PAGE_W - 55, 18, 9, GRAY_600)


def draw_button(c: canvas.Canvas, x: float, y: float, w: float, label: str,
                primary: bool = True) -> None:
    c.setFillColor(BLUE if primary else WHITE)
    c.setStrokeColor(BLUE)
    c.setLineWidth(1)
    c.roundRect(x, y, w, 34, 9, stroke=1, fill=1)
    c.setFont("TV-Bold", 10)
    c.setFillColor(WHITE if primary else NAVY)
    tw = pdfmetrics.stringWidth(label, "TV-Bold", 10)
    c.drawString(x + max(10, (w - tw) / 2), y + 12, label)


def draw_image_cover(c: canvas.Canvas, path: Path, x: float, y: float,
                     w: float, h: float) -> None:
    if not path.exists():
        c.setFillColor(GRAY_100)
        c.rect(x, y, w, h, stroke=0, fill=1)
        return
    with Image.open(path) as im:
        iw, ih = im.size
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    c.saveState()
    p = c.beginPath()
    p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)
    c.drawImage(str(path), x + (w - dw) / 2, y + (h - dh) / 2,
                dw, dh, preserveAspectRatio=True, mask="auto")
    c.restoreState()


def draw_desktop_mock(c: canvas.Canvas, x: float, y: float, w: float, h: float,
                      title: str, route: str, cta: str, image_path: Path | None = None,
                      local: bool = False) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(GRAY_200)
    c.roundRect(x, y, w, h, 12, stroke=1, fill=1)
    c.setFillColor(NAVY)
    c.roundRect(x + 14, y + h - 31, 76, 18, 6, stroke=0, fill=1)
    draw_text(c, "TemichevVET", x + 20, y + h - 25, 7.5, WHITE, True)
    nav = "Здоровье   О враче   Магазин   Для ветклиник"
    draw_text(c, nav, x + 108, y + h - 25, 6.8, NAVY, True)
    c.setFillColor(BLUE_SOFT)
    c.roundRect(x + w - 98, y + h - 33, 82, 21, 7, stroke=0, fill=1)
    draw_text(c, "Армавир" if not local else "Позвонить", x + w - 80, y + h - 26, 7, BLUE, True)
    hero_y = y + h * 0.40
    left_w = w * 0.57
    title_lines = wrap(title, 28)[:3]
    title_y = y + h - 74
    for index, line in enumerate(title_lines):
        draw_text(c, line, x + 22, title_y - index * 20, 17, NAVY, True)
    subtitle = ("Кандидат ветеринарных наук · запись, адреса и понятный следующий шаг."
                if local else
                "Константин Темичев — ветеринарный врач, кандидат ветеринарных наук.")
    subtitle_y = title_y - len(title_lines) * 20 - 8
    draw_text(c, subtitle, x + 22, subtitle_y, 7.7, GRAY_600, False, 56, 11)
    draw_button(c, x + 22, hero_y, min(200, left_w - 32), cta, True)
    if image_path:
        draw_image_cover(c, image_path, x + left_w + 10, hero_y - 10, w - left_w - 26, h * 0.45)
    else:
        c.setFillColor(BLUE_SOFT)
        c.roundRect(x + left_w + 10, hero_y - 10, w - left_w - 26, h * 0.45, 10, stroke=0, fill=1)
    card_y = y + 24
    for i, label in enumerate(["Понятно", "Безопасно", "Следующий шаг"]):
        cx = x + 22 + i * ((w - 56) / 3)
        cw = (w - 78) / 3
        c.setFillColor(GRAY_50)
        c.roundRect(cx, card_y, cw, 50, 8, stroke=0, fill=1)
        draw_text(c, label, cx + 10, card_y + 31, 7.5, NAVY, True)
        draw_text(c, route, cx + 10, card_y + 16, 5.8, GRAY_600, False, 24, 7)


def draw_mobile_mock(c: canvas.Canvas, x: float, y: float, w: float, h: float,
                     title: str, route: str, cta: str, image_path: Path | None = None,
                     local: bool = False) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(GRAY_200)
    c.roundRect(x, y, w, h, 16, stroke=1, fill=1)
    c.setFillColor(NAVY)
    c.roundRect(x + 13, y + h - 32, 70, 18, 6, stroke=0, fill=1)
    draw_text(c, "TemichevVET", x + 18, y + h - 26, 7, WHITE, True)
    draw_text(c, "МЕНЮ", x + w - 45, y + h - 26, 6.4, BLUE, True)
    top = y + h - 57
    if image_path:
        draw_image_cover(c, image_path, x + 13, top - 118, w - 26, 104)
        title_y = top - 138
    else:
        title_y = top - 12
    title_lines = wrap(title, 23)[:3]
    for index, line in enumerate(title_lines):
        draw_text(c, line, x + 13, title_y - index * 16, 13.5, NAVY, True)
    subtitle = "Кандидат ветеринарных наук"
    sub_y = title_y - len(title_lines) * 16 - 8
    draw_text(c, subtitle, x + 13, sub_y, 7.4, GRAY_600)
    draw_button(c, x + 13, sub_y - 48, w - 26, cta, True)
    cy = sub_y - 82
    for label in ["Основное", "Как это работает", "Ответы на вопросы"]:
        c.setFillColor(GRAY_50)
        c.roundRect(x + 13, cy, w - 26, 38, 8, stroke=0, fill=1)
        draw_text(c, label, x + 23, cy + 23, 7.5, NAVY, True)
        draw_text(c, route, x + 23, cy + 10, 5.8, GRAY_600)
        cy -= 47


def draw_route_table_page(c: canvas.Canvas, routes: list[tuple[str, str, str, str]], page_no: int,
                          title: str) -> None:
    page_title(c, "Экраны", title, "Для каждого адреса предусмотрены desktop 1440 и mobile 390")
    x0, y0 = 42, PAGE_H - 198
    widths = [34, 160, 235, 200, 120]
    headers = ["№", "Адрес", "Экран", "Главное действие", "Контур"]
    c.setFillColor(NAVY)
    c.roundRect(x0, y0, sum(widths), 32, 8, stroke=0, fill=1)
    x = x0
    for head, w in zip(headers, widths):
        draw_text(c, head, x + 8, y0 + 11, 9, WHITE, True)
        x += w
    y = y0 - 42
    start_idx = ROUTES.index(routes[0]) + 1
    for offset, (route, screen, cta, area) in enumerate(routes):
        if offset % 2 == 0:
            c.setFillColor(GRAY_50)
            c.roundRect(x0, y - 6, sum(widths), 34, 4, stroke=0, fill=1)
        values = [str(start_idx + offset), route, screen, cta, area]
        x = x0
        for value, w in zip(values, widths):
            draw_text(c, value, x + 8, y + 6, 8.2, NAVY if value != area else BLUE,
                      value in {screen, cta}, max_chars=max(10, int(w / 5.7)), leading=9.5)
            x += w
        y -= 42
    page_footer(c, page_no)
    c.showPage()


def add_cover(c: canvas.Canvas) -> None:
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(BLUE_SOFT)
    c.rect(PAGE_W * 0.58, 0, PAGE_W * 0.42, PAGE_H, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.roundRect(48, PAGE_H - 92, 155, 34, 10, stroke=0, fill=1)
    draw_text(c, "TemichevVET", 64, PAGE_H - 80, 15, WHITE, True)
    draw_text(c, "Сайт и экосистема", 48, PAGE_H - 176, 38, NAVY, True)
    draw_text(c, "Полный первичный план v1", 48, PAGE_H - 221, 26, BLUE, True)
    draw_text(c,
              "Общий бренд TemichevVet, отдельная клиника в Армавире, здоровье питомца, магазин и CRM для ветклиник.",
              48, PAGE_H - 272, 15, GRAY_600, False, 63, 21)
    c.setFillColor(WHITE)
    c.setStrokeColor(GRAY_200)
    c.roundRect(PAGE_W * 0.58 + 28, 74, PAGE_W * 0.42 - 56, PAGE_H - 148, 18, stroke=1, fill=1)
    draw_image_cover(c, ASSETS / "homepage-concept-approved-direction.png",
                     PAGE_W * 0.58 + 42, 88, PAGE_W * 0.42 - 84, PAGE_H - 176)
    draw_text(c, "54 основных адаптивных фрейма + состояния", 48, 128, 13, NAVY, True)
    draw_text(c, "Константин Темичев — ветеринарный врач, кандидат ветеринарных наук, создатель TemichevVet.",
              48, 96, 11, GRAY_600, False, 72, 16)
    page_footer(c, 1)
    c.showPage()


def add_strategy(c: canvas.Canvas, page_no: int) -> None:
    page_title(c, "Стратегия", "Две страницы для двух рекламных намерений",
               "Единый бренд, разные первые экраны и разные конверсии")
    cards = [
        (52, BLUE, "Общая экосистема", "temichevvet.ru/",
         ["Здоровье питомца", "Врач и база знаний", "Личный кабинет", "Магазин", "CRM для клиник"],
         "Оценить состояние питомца"),
        (PAGE_W / 2 + 18, NAVY, "Клиника в Армавире", "temichevvet.ru/armavir/",
         ["Запись", "Звонок", "Маршрут", "Услуги", "Груминг и зоогостиница"],
         "Записаться на приём"),
    ]
    for x, color, title, url, bullets, cta in cards:
        c.setFillColor(WHITE)
        c.setStrokeColor(GRAY_200)
        c.roundRect(x, 150, PAGE_W / 2 - 84, 410, 18, stroke=1, fill=1)
        c.setFillColor(color)
        c.roundRect(x + 22, 500, 205, 32, 10, stroke=0, fill=1)
        draw_text(c, title, x + 36, 511, 12, WHITE, True)
        draw_text(c, url, x + 22, 464, 18, NAVY, True)
        yy = 420
        for item in bullets:
            c.setFillColor(BLUE_SOFT)
            c.circle(x + 30, yy + 4, 5, stroke=0, fill=1)
            c.setFillColor(BLUE)
            c.circle(x + 30, yy + 4, 2, stroke=0, fill=1)
            draw_text(c, item, x + 44, yy, 11, NAVY)
            yy -= 42
        draw_button(c, x + 22, 178, PAGE_W / 2 - 128, cta, True)
    draw_text(c, "Общая реклама не обещает локальный приём. Локальная реклама не уводит пользователя в общий продуктовый рассказ.",
              52, 112, 12, GRAY_600, False, 115, 17)
    page_footer(c, page_no)
    c.showPage()


def add_full_hero(c: canvas.Canvas, page_no: int, mobile: bool, local: bool) -> None:
    page_title(c, "Ключевой экран", ("Mobile" if mobile else "Desktop") +
               (" — клиника в Армавире" if local else " — общая главная"),
               "Первичная визуальная композиция")
    if mobile:
        draw_mobile_mock(c, PAGE_W / 2 - 130, 70, 260, 500,
                         "Ветеринарная клиника в Армавире" if local else
                         "Всё для здоровья питомца — от первого симптома до заботы каждый день",
                         "/armavir/" if local else "/",
                         "Записаться на приём" if local else "Оценить состояние",
                         ASSETS / ("IMG_6989.jpg" if local else "IMG_6984.jpg"), local)
    else:
        draw_desktop_mock(c, 80, 98, PAGE_W - 160, 470,
                          "Ветеринарная клиника в Армавире" if local else
                          "Всё для здоровья питомца — от первого симптома до заботы на каждый день",
                          "/armavir/" if local else "/",
                          "Записаться на приём" if local else "Оценить состояние питомца",
                          ASSETS / ("IMG_6989.jpg" if local else "IMG_6984.jpg"), local)
    page_footer(c, page_no)
    c.showPage()


def add_grid(c: canvas.Canvas, page_no: int, title: str, items: list[tuple[str, str, str, str]],
             mobile: bool = False, local: bool = False) -> None:
    page_title(c, "Макеты", title, "Каждая карточка соответствует отдельному адресу сайта")
    cols = 5 if mobile else 3
    rows = math.ceil(len(items) / cols)
    gap = 18
    margin_x = 42
    top = PAGE_H - 188
    usable_w = PAGE_W - 84
    cell_w = (usable_w - gap * (cols - 1)) / cols
    cell_h = min((top - 58 - gap * (rows - 1)) / rows, 205 if not mobile else 230)
    for i, (route, screen, cta, _area) in enumerate(items):
        col = i % cols
        row = i // cols
        x = margin_x + col * (cell_w + gap)
        y = top - (row + 1) * cell_h - row * gap
        photo = None
        if route == "/": photo = ASSETS / "IMG_6984.jpg"
        if route == "/doctor/": photo = ASSETS / "IMG_6989.jpg"
        if route == "/armavir/": photo = ASSETS / "IMG_7046.JPG"
        if route == "/store/": photo = ASSETS / "IMG_7110.JPG"
        if mobile:
            draw_mobile_mock(c, x, y, cell_w, cell_h, screen, route, cta, photo, local)
        else:
            draw_desktop_mock(c, x, y, cell_w, cell_h, screen, route, cta, photo, local)
    page_footer(c, page_no)
    c.showPage()


def add_photo_library(c: canvas.Canvas, page_no: int) -> None:
    page_title(c, "Медиатека", "Все переданные фотографии",
               "Каждый файл закреплён за конкретной задачей сайта")
    cols = 4
    gap = 16
    margin = 42
    card_w = (PAGE_W - 84 - gap * (cols - 1)) / cols
    card_h = 142
    top = PAGE_H - 190
    for i, (name, use) in enumerate(PHOTO_MAP):
        col = i % cols
        row = i // cols
        x = margin + col * (card_w + gap)
        y = top - (row + 1) * card_h - row * gap
        c.setFillColor(WHITE)
        c.setStrokeColor(GRAY_200)
        c.roundRect(x, y, card_w, card_h, 10, stroke=1, fill=1)
        draw_image_cover(c, ASSETS / name, x + 8, y + 42, card_w - 16, card_h - 50)
        draw_text(c, name, x + 10, y + 25, 8.5, NAVY, True)
        draw_text(c, use, x + 10, y + 10, 7.2, GRAY_600, False, 32, 8)
    page_footer(c, page_no)
    c.showPage()


def add_states(c: canvas.Canvas, page_no: int) -> None:
    page_title(c, "Состояния", "Формы, чат и сервисные сценарии",
               "Не только красивые первые экраны: проектируется полный путь пользователя")
    items = [
        ("Чат", ["Закрыт", "Приветствие", "Сообщение", "Отправлено", "Оператор недоступен"]),
        ("Онлайн-запись", ["Пусто", "Заполнение", "Ошибка", "Отправка", "Заявка принята"]),
        ("Корзина", ["Пустая", "С товарами", "Промокод", "Оформление", "Заказ принят"]),
        ("Кабинет", ["Вход", "Просрочено", "Нет приглашения", "Помощь", "Безопасный выход"]),
    ]
    y = 500
    for title, states in items:
        draw_text(c, title, 52, y + 18, 14, NAVY, True)
        x = 210
        for state in states:
            c.setFillColor(WHITE)
            c.setStrokeColor(GRAY_200)
            c.roundRect(x, y, 126, 66, 10, stroke=1, fill=1)
            c.setFillColor(BLUE_SOFT)
            c.circle(x + 18, y + 44, 8, stroke=0, fill=1)
            draw_text(c, state, x + 34, y + 40, 8, NAVY, True, 17, 9)
            draw_text(c, "проверяемый экран", x + 14, y + 16, 6.5, GRAY_600)
            x += 140
        y -= 100
    page_footer(c, page_no)
    c.showPage()


def add_integration(c: canvas.Canvas, page_no: int) -> None:
    page_title(c, "Интеграция", "Сайт, публичный шлюз и локальная CRM",
               "Клиническая база не открывается в интернет")
    blocks = [
        (70, 390, 210, 110, BLUE, "Владелец питомца", "Сайт, мобильный экран, чат"),
        (370, 390, 230, 110, NAVY, "Публичный owner-gateway", "Заявки и разрешённые данные"),
        (690, 390, 210, 110, GREEN, "Локальная CRM", "Исходящее получение заявок"),
    ]
    for x, y, w, h, color, title, sub in blocks:
        c.setFillColor(WHITE)
        c.setStrokeColor(color)
        c.setLineWidth(2)
        c.roundRect(x, y, w, h, 15, stroke=1, fill=1)
        c.setFillColor(color)
        c.roundRect(x + 14, y + h - 40, w - 28, 26, 9, stroke=0, fill=1)
        draw_text(c, title, x + 26, y + h - 31, 10, WHITE, True)
        draw_text(c, sub, x + 18, y + 38, 8.5, GRAY_600, False, 29, 11)
    for x1, x2 in [(280, 370), (600, 690)]:
        c.setStrokeColor(BLUE)
        c.setLineWidth(2)
        c.line(x1, 445, x2, 445)
        c.setFillColor(BLUE)
        c.circle(x2 - 5, 445, 4, stroke=0, fill=1)
    draw_text(c, "Публичная форма", 70, 322, 14, NAVY, True)
    fields = ["Имя", "Телефон", "Кличка", "Вид животного", "Желаемая дата", "Филиал", "Комментарий", "Согласие"]
    x, y = 70, 280
    for i, field in enumerate(fields):
        fx = x + (i % 4) * 205
        fy = y - (i // 4) * 58
        c.setFillColor(GRAY_50)
        c.setStrokeColor(GRAY_200)
        c.roundRect(fx, fy, 188, 42, 8, stroke=1, fill=1)
        draw_text(c, field, fx + 12, fy + 17, 8.5, NAVY, True)
    draw_text(c, "Заявка получает статус «Ожидает обработки». Приём в расписании создаёт только администратор после подтверждения.",
              70, 138, 11, GRAY_600, False, 112, 16)
    page_footer(c, page_no)
    c.showPage()


def generate_pdf() -> None:
    register_fonts()
    PDF_OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(PDF_OUT), pagesize=landscape(A3))
    c.setTitle("TemichevVet — сайт и экосистема v1")
    add_cover(c)
    add_strategy(c, 2)
    draw_route_table_page(c, ROUTES[0:9], 3, "Карта экранов 1/3")
    draw_route_table_page(c, ROUTES[9:18], 4, "Карта экранов 2/3")
    draw_route_table_page(c, ROUTES[18:27], 5, "Карта экранов 3/3")
    add_full_hero(c, 6, mobile=False, local=False)
    add_full_hero(c, 7, mobile=True, local=False)
    add_full_hero(c, 8, mobile=False, local=True)
    add_full_hero(c, 9, mobile=True, local=True)
    add_grid(c, 10, "Общий сайт — desktop", ROUTES[0:7], mobile=False)
    add_grid(c, 11, "Общий сайт — mobile", ROUTES[0:7], mobile=True)
    add_grid(c, 12, "Магазин и CRM — desktop", ROUTES[7:13], mobile=False)
    add_grid(c, 13, "Магазин и CRM — mobile", ROUTES[7:13], mobile=True)
    add_grid(c, 14, "Клиника в Армавире — desktop", ROUTES[13:21], mobile=False, local=True)
    add_grid(c, 15, "Клиника в Армавире — mobile", ROUTES[13:21], mobile=True, local=True)
    add_grid(c, 16, "Сервисные и правовые экраны — desktop", ROUTES[21:27], mobile=False)
    add_grid(c, 17, "Сервисные и правовые экраны — mobile", ROUTES[21:27], mobile=True)
    add_states(c, 18)
    add_photo_library(c, 19)
    add_integration(c, 20)
    c.save()


def data_uri(path: Path) -> str:
    if not path.exists():
        return ""
    with Image.open(path) as source:
        image = source.convert("RGB")
        image.thumbnail((360, 360), Image.Resampling.LANCZOS)
        payload = io.BytesIO()
        image.save(payload, format="JPEG", quality=38, optimize=True, progressive=True)
    return f"data:image/jpeg;base64,{base64.b64encode(payload.getvalue()).decode('ascii')}"


def svg_text(x: float, y: float, value: str, size: int, weight: int = 400,
             fill: str = "#07162F", anchor: str = "start") -> str:
    return (f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{html.escape(value)}</text>')


def svg_screen(x: float, y: float, w: float, h: float, route: str, title: str,
               cta: str, mobile: bool, photo_uri: str = "", local: bool = False) -> str:
    r = 20 if mobile else 16
    out = [f'<g transform="translate({x} {y})">']
    out.append(f'<rect width="{w}" height="{h}" rx="{r}" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>')
    out.append(f'<rect x="18" y="16" width="116" height="30" rx="9" fill="#07162F"/>')
    out.append(svg_text(30, 37, "TemichevVET", 12, 700, "#FFFFFF"))
    if mobile:
        out.append(svg_text(w - 20, 37, "МЕНЮ", 10, 700, "#0B57D0", "end"))
        image_y, image_h = 62, 130
        if photo_uri:
            out.append(f'<image href="{photo_uri}" x="18" y="{image_y}" width="{w-36}" height="{image_h}" preserveAspectRatio="xMidYMid slice"/>')
        else:
            out.append(f'<rect x="18" y="{image_y}" width="{w-36}" height="{image_h}" rx="12" fill="#F3F8FF"/>')
        title_y = image_y + image_h + 32
        for idx, line in enumerate(wrap(title, 25)[:3]):
            out.append(svg_text(18, title_y + idx * 24, line, 18, 700))
        by = title_y + 76
        out.append(svg_text(18, by-12, "Константин Темичев · кандидат ветеринарных наук", 10, 600, "#475569"))
        by += 4
        out.append(f'<rect x="18" y="{by}" width="{w-36}" height="46" rx="12" fill="#0B57D0"/>')
        out.append(svg_text(w/2, by+29, cta[:34], 12, 700, "#FFFFFF", "middle"))
        cy = by + 64
        for label in ["Основное", "Как это работает", "Ответы на вопросы"]:
            out.append(f'<rect x="18" y="{cy}" width="{w-36}" height="48" rx="10" fill="#F8FAFC"/>')
            out.append(svg_text(32, cy+29, label, 11, 700))
            cy += 58
    else:
        out.append(svg_text(160, 36, "Здоровье   О враче   Магазин   Для ветклиник", 10, 700))
        out.append(f'<rect x="{w-126}" y="15" width="108" height="32" rx="10" fill="#F3F8FF"/>')
        out.append(svg_text(w-72, 36, "Армавир" if not local else "Позвонить", 10, 700, "#0B57D0", "middle"))
        tx, ty = 24, 102
        for idx, line in enumerate(wrap(title, 34)[:3]):
            out.append(svg_text(tx, ty + idx * 31, line, 24, 700))
        out.append(svg_text(tx, ty + 104, "Константин Темичев · кандидат ветеринарных наук", 11, 600, "#475569"))
        out.append(f'<rect x="24" y="{ty+132}" width="220" height="48" rx="12" fill="#0B57D0"/>')
        out.append(svg_text(134, ty+162, cta[:36], 12, 700, "#FFFFFF", "middle"))
        ix, iy, iw, ih = w*0.58, 70, w*0.39, h*0.55
        if photo_uri:
            out.append(f'<image href="{photo_uri}" x="{ix}" y="{iy}" width="{iw}" height="{ih}" preserveAspectRatio="xMidYMid slice"/>')
        else:
            out.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="14" fill="#F3F8FF"/>')
        cy = h - 88
        for i, label in enumerate(["Понятно", "Безопасно", "Следующий шаг"]):
            cx = 24 + i * ((w-60)/3)
            cw = (w-84)/3
            out.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="58" rx="10" fill="#F8FAFC"/>')
            out.append(svg_text(cx+14, cy+24, label, 11, 700))
            out.append(svg_text(cx+14, cy+43, route[:28], 8, 400, "#475569"))
    out.append(f'<text x="{w-16}" y="{h-14}" font-family="Arial" font-size="9" fill="#94A3B8" text-anchor="end">{html.escape(route)}</text>')
    out.append("</g>")
    return "".join(out)


def generate_svg() -> None:
    hero_uri = data_uri(ASSETS / "IMG_6984.jpg")
    doctor_uri = data_uri(ASSETS / "IMG_6989.jpg")
    clinic_uri = data_uri(ASSETS / "IMG_7046.JPG")
    store_uri = data_uri(ASSETS / "IMG_7110.JPG")
    width = 7900
    section_gap = 120
    desktop_w, desktop_h = 700, 440
    mobile_w, mobile_h = 300, 580
    left = 120
    y = 150
    chunks: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="15000" viewBox="0 0 {width} 15000">',
        '<rect width="100%" height="100%" fill="#F1F5F9"/>',
        svg_text(120, 86, "TemichevVet — полный первичный макет v1", 38, 700),
        svg_text(120, 122, "27 адресов · desktop 1440 · mobile 390 · общая экосистема + отдельная клиника в Армавире", 18, 400, "#475569"),
    ]
    groups = [
        ("01 · Общий бренд и здоровье — desktop", ROUTES[0:7], False, False),
        ("02 · Магазин и CRM — desktop", ROUTES[7:13], False, False),
        ("03 · Клиника в Армавире — desktop", ROUTES[13:21], False, True),
        ("04 · Сервис и право — desktop", ROUTES[21:27], False, False),
        ("05 · Общий бренд и здоровье — mobile", ROUTES[0:7], True, False),
        ("06 · Магазин и CRM — mobile", ROUTES[7:13], True, False),
        ("07 · Клиника в Армавире — mobile", ROUTES[13:21], True, True),
        ("08 · Сервис и право — mobile", ROUTES[21:27], True, False),
    ]
    for heading, items, mobile, local in groups:
        chunks.append(svg_text(left, y, heading, 28, 700))
        y += 46
        cols = 6 if mobile else 5
        sw, sh = (mobile_w, mobile_h) if mobile else (desktop_w, desktop_h)
        gap_x = 56
        gap_y = 86
        for i, (route, title, cta, _area) in enumerate(items):
            col = i % cols
            row = i // cols
            x = left + col * (sw + gap_x)
            sy = y + row * (sh + gap_y)
            photo = ""
            if route == "/": photo = hero_uri
            elif route == "/doctor/": photo = doctor_uri
            elif route == "/armavir/": photo = clinic_uri
            elif route == "/store/": photo = store_uri
            chunks.append(svg_screen(x, sy, sw, sh, route, title, cta, mobile, photo, local))
        rows = math.ceil(len(items) / cols)
        y += rows * (sh + gap_y) + section_gap
    chunks.append(svg_text(left, y, "09 · Медиатека — все 12 фотографий", 28, 700))
    y += 50
    thumb_w, thumb_h = 420, 260
    for i, (name, use) in enumerate(PHOTO_MAP):
        col, row = i % 6, i // 6
        x = left + col * (thumb_w + 54)
        sy = y + row * (thumb_h + 82)
        uri = data_uri(ASSETS / name)
        chunks.append(f'<g transform="translate({x} {sy})"><rect width="{thumb_w}" height="{thumb_h+58}" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>')
        chunks.append(f'<image href="{uri}" x="12" y="12" width="{thumb_w-24}" height="{thumb_h-24}" preserveAspectRatio="xMidYMid slice"/>')
        chunks.append(svg_text(16, thumb_h+18, name, 13, 700))
        chunks.append(svg_text(16, thumb_h+41, use, 11, 400, "#475569"))
        chunks.append('</g>')
    y += 2 * (thumb_h + 82) + 180
    chunks.append(svg_text(left, y, "Квалификация на ключевых экранах", 28, 700))
    y += 38
    chunks.append(svg_text(left, y, "Константин Темичев — ветеринарный врач, кандидат ветеринарных наук, создатель TemichevVet.", 22, 700, "#0B57D0"))
    chunks.append("</svg>")
    content = "".join(chunks).replace('height="15000" viewBox="0 0 7900 15000"', f'height="{int(y+120)}" viewBox="0 0 7900 {int(y+120)}"', 1)
    SVG_OUT.parent.mkdir(parents=True, exist_ok=True)
    SVG_OUT.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    generate_pdf()
    generate_svg()
    print(PDF_OUT)
    print(SVG_OUT)
