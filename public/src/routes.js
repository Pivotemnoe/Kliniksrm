import {
  dashboardPage,
  hospitalPage,
  newsDetailPage,
  newsPage,
  onlineRequestsPage,
  queuePage,
  tasksPage,
  timetablePage
} from "./pages/workflow.js";
import { animalCardPage, animalsPage, ownerCardPage, ownersPage, visitPage } from "./pages/clients.js";
import { billsPage, shopPage } from "./pages/finance.js";
import { stockPage } from "./pages/stock.js";
import { settingsPage } from "./pages/settings.js";
import { assistantPage, profilePage } from "./pages/profile.js";

export const routes = [
  { path: "/", title: "Сводка", view: dashboardPage },
  { path: "/news", title: "Новости", view: newsPage },
  { path: "/news/:id", title: "Новость", view: newsDetailPage },
  { path: "/dashboard", title: "Сводка", view: dashboardPage },
  { path: "/dashboard/:tab", title: "Сводка", view: dashboardPage },
  { path: "/timetable", title: "Расписание", view: timetablePage },
  { path: "/timetable/:date", title: "Расписание", view: timetablePage },
  { path: "/queue", title: "Электронная очередь", view: queuePage },
  { path: "/queue/:status", title: "Электронная очередь", view: queuePage },
  { path: "/tasks", title: "Календарь задач", view: tasksPage },
  { path: "/tasks/:status", title: "Календарь задач", view: tasksPage },
  { path: "/online-requests", title: "Онлайн-запись", view: onlineRequestsPage },
  { path: "/online-requests/:status", title: "Онлайн-запись", view: onlineRequestsPage },
  { path: "/owners", title: "Владельцы", view: ownersPage },
  { path: "/owners/:id", title: "Карточка владельца", view: ownerCardPage },
  { path: "/owners/:id/:tab", title: "Карточка владельца", view: ownerCardPage },
  { path: "/animals", title: "Пациенты", view: animalsPage },
  { path: "/animals/:id", title: "Карточка пациента", view: animalCardPage },
  { path: "/animals/:id/:tab", title: "Карточка пациента", view: animalCardPage },
  { path: "/visits/:id", title: "Приём", view: visitPage },
  { path: "/visits/:id/:tab", title: "Приём", view: visitPage },
  { path: "/bills", title: "Счета", view: billsPage },
  { path: "/bills/:id", title: "Счёт", view: billsPage },
  { path: "/shop", title: "Продажи", view: shopPage },
  { path: "/shop/:mode", title: "Продажи", view: shopPage },
  { path: "/hospital", title: "Стационар", view: hospitalPage },
  { path: "/stock/:section", title: "Склад", view: stockPage },
  { path: "/stock/:section/:tab", title: "Склад", view: stockPage },
  { path: "/settings/:section", title: "Настройки", view: settingsPage },
  { path: "/settings/:section/:tab", title: "Настройки", view: settingsPage },
  { path: "/settings/:section/:tab/:subtab", title: "Настройки", view: settingsPage },
  { path: "/profile", title: "Мой профиль", view: profilePage },
  { path: "/profile/:tab", title: "Мой профиль", view: profilePage },
  { path: "/assistant", title: "Помощник", view: assistantPage }
];
