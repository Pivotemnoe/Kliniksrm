#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const planPath = path.resolve(scriptDir, "../docs/product/temichevvet-improvement-plan.json");
const plan = JSON.parse(await readFile(planPath, "utf8"));
const statusLabels = new Map(plan.status_model.map((item) => [item.code, item.label]));
const requested = process.argv[2]?.toUpperCase();
const selected = requested
  ? plan.items.filter((item) => item.id.toUpperCase() === requested || item.priority === requested)
  : plan.items;

if (requested && selected.length === 0) {
  console.error(`Не найден этап ${requested}. Используйте P0, P1, P2 или точный номер, например P0.1.`);
  process.exitCode = 1;
} else {
  const focus = plan.items.find((item) => item.id === plan.current_focus);
  const validation = plan.items.find((item) => item.id === plan.parallel_validation);
  const counts = plan.items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(plan.title.toUpperCase());
  console.log(`Актуально: ${plan.updated_at} · версия ${plan.version} · срез ${plan.source_snapshot}`);
  console.log(`Сейчас: ${focus.id} — ${focus.title}`);
  console.log(`Параллельная проверка: ${validation.id} — ${validation.title}`);
  console.log(
    `Сводка: ${plan.items.length} пунктов · в работе ${counts.IN_PROGRESS ?? 0} · ` +
      `код готов ${counts.CODE_READY ?? 0} · локально проверено ${counts.LOCAL_VERIFIED ?? 0} · ` +
      `принято в клинике ${counts.CLINIC_ACCEPTED ?? 0} · стабильно ${counts.STABLE ?? 0}`,
  );
  console.log("");

  for (const priority of ["P0", "P1", "P2"]) {
    const items = selected.filter((item) => item.priority === priority);
    if (items.length === 0) continue;
    console.log(`${priority}:`);
    for (const item of items) {
      console.log(`  ${item.id} [${statusLabels.get(item.status) ?? item.status}] ${item.title}`);
      console.log(`      Следующее действие: ${item.next_action}`);
    }
    console.log("");
  }

  console.log("Правило закрытия: код готов ≠ принято в клинике. Пункт закрывается только после подтверждённой приёмки и периода стабильной работы.");
}
