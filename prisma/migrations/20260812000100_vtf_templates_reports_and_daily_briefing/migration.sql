-- Additive VTF template import. No clinical, financial, file, or generated-document rows are changed.
-- Laboratory forms are ordinary manual document templates only; no laboratory completion automation is enabled.
INSERT INTO "DocumentTemplateCategory" ("id","title","createdAt","updatedAt") VALUES ('a1000000-0000-4000-8000-000000000001','VTF · на юридическую проверку',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("title") DO NOTHING;
INSERT INTO "DocumentTemplateCategory" ("id","title","createdAt","updatedAt") VALUES ('a1000000-0000-4000-8000-000000000002','VTF · лабораторные бланки (ручные)',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("title") DO NOTHING;
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000005415',c."id",'Согласие на обработку персональных данных','СОГЛАСИЕ
на обработку персональных данных
Ф.И.О. субъекта персональных данных: {owner.fullName}
Адрес регистрации: {owner.address}
Документ, удостоверяющий личность: паспорт
Серия, номер и дата выдачи: {owner.passportData}
Орган, выдавший документ: ____________________________________________________
Даю согласие {organization.legalName}, расположенному по адресу: {organization.legalAddress}, на обработку персональных данных для оказания медицинских , косметологических и иных услуг при условии, что обработка персональных данных осуществляется лицами, профессионально занимающихся медицинской деятельностью и обязанными в соответствии с законодательством Российской Федерации сохранять врачебную тайну по следующему перечню персональных данных: фамилия, имя, отчество (последнее - при наличии), пол, дата рождения, место рождения, гражданство, данные документа, удостоверяющего личность, место жительства, место регистрации, дата регистрации, диагноз, сведения об организации (ях), в которые обращался Клиент до момента обращения к Оператору, оказавшей медицинские, косметологические и иные услуги, вид оказанной медицинской, косметологической и иной услуги, условия оказания медицинской, косметологической и иной услуги, сроки оказания медицинской, косметологической и иной услуги, объем оказанной медицинской, косметологической и иной услуги, результат обращения за медицинской, косметологической и иной услугой, серия и номер выданных медицинских заключений (при наличии), сведения об оказанных медицинских, косметологических и иных услугах, примененные стандарты медицинской помощи, сведения о медицинском работнике или медицинских работниках, оказавших медицинскую, косметологическую и иную услугу Клиенту.
Предоставляю Оператору право осуществлять ведение персонифицированного учета при осуществлении медицинской деятельности.
В случае, если Оператор поручит обработку персональных данных другому лицу, ответственность перед субъектом персональных данных за действия указанного лица несет Оператор. Лицо, осуществляющее обработку персональных данных по поручению Оператора, несет ответственность перед Оператором.
Даю согласие субъекта персональных данных на обработку моих персональных данных в течение срока хранения
медицинской карты амбулаторного больного (форма медицинской документации № 025/у) – двадцать пять лет.
Оставляю за собой право отозвать согласие субъекта персональных данных на обработку его персональных данных посредством составления соответствующего письменного заявления, которое будет вручено лично под расписку представителю Оператора или направлено в адрес Оператора по почте заказным письмом с уведомлением о вручении.
{currentDate} ________ ____________________
(подпись) (расшифровка)','{"blocks":[{"align":"left","bold":false,"fontSize":11,"id":"vtf-text-1","italic":false,"text":"СОГЛАСИЕ\nна обработку персональных данных\nФ.И.О. субъекта персональных данных: {owner.fullName}\nАдрес регистрации: {owner.address}\nДокумент, удостоверяющий личность: паспорт\nСерия, номер и дата выдачи: {owner.passportData}\nОрган, выдавший документ: ____________________________________________________\nДаю согласие {organization.legalName}, расположенному по адресу: {organization.legalAddress}, на обработку персональных данных для оказания медицинских , косметологических и иных услуг при условии, что обработка персональных данных осуществляется лицами, профессионально занимающихся медицинской деятельностью и обязанными в соответствии с законодательством Российской Федерации сохранять врачебную тайну по следующему перечню персональных данных: фамилия, имя, отчество (последнее - при наличии), пол, дата рождения, место рождения, гражданство, данные документа, удостоверяющего личность, место жительства, место регистрации, дата регистрации, диагноз, сведения об организации (ях), в которые обращался Клиент до момента обращения к Оператору, оказавшей медицинские, косметологические и иные услуги, вид оказанной медицинской, косметологической и иной услуги, условия оказания медицинской, косметологической и иной услуги, сроки оказания медицинской, косметологической и иной услуги, объем оказанной медицинской, косметологической и иной услуги, результат обращения за медицинской, косметологической и иной услугой, серия и номер выданных медицинских заключений (при наличии), сведения об оказанных медицинских, косметологических и иных услугах, примененные стандарты медицинской помощи, сведения о медицинском работнике или медицинских работниках, оказавших медицинскую, косметологическую и иную услугу Клиенту.\nПредоставляю Оператору право осуществлять ведение персонифицированного учета при осуществлении медицинской деятельности.\nВ случае, если Оператор поручит обработку персональных данных другому лицу, ответственность перед субъектом персональных данных за действия указанного лица несет Оператор. Лицо, осуществляющее обработку персональных данных по поручению Оператора, несет ответственность перед Оператором.\nДаю согласие субъекта персональных данных на обработку моих персональных данных в течение срока хранения\nмедицинской карты амбулаторного больного (форма медицинской документации № 025/у) – двадцать пять лет.\nОставляю за собой право отозвать согласие субъекта персональных данных на обработку его персональных данных посредством составления соответствующего письменного заявления, которое будет вручено лично под расписку представителю Оператора или направлено в адрес Оператора по почте заказным письмом с уведомлением о вручении.\n{currentDate} ________ ____________________\n(подпись) (расшифровка)","type":"text"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":true,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"5415","reviewStatus":"LEGAL_REVIEW_REQUIRED"}'::jsonb,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · на юридическую проверку' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Согласие на обработку персональных данных');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000005415',t."id",1,'VTF · на юридическую проверку',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · на юридическую проверку' AND t."title"='Согласие на обработку персональных данных' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000005414',c."id",'Договор на оказание услуг','Исполнитель: {organization.legalName}

Адрес: {organization.legalAddress}

Телефон: +  {office.phone}

ИНН {organization.inn}

БИК {organization.bik}

Р/С {organization.account}

К/С {organization.account} | Заказчик:

ФИО: {owner.fullName}

Паспорт: {owner.passportData}

Выдан:_____________________

Адрес: {owner.address}

Телефон:+  {owner.phone}
Исполнитель: | Заказчик:
____________________________________________________________ | ____________________________________________________________','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Исполнитель: {organization.legalName}\n\nАдрес: {organization.legalAddress}\n\nТелефон: +  {office.phone}\n\nИНН {organization.inn}\n\nБИК {organization.bik}\n\nР/С {organization.account}\n\nК/С {organization.account}","Заказчик:\n\nФИО: {owner.fullName}\n\nПаспорт: {owner.passportData}\n\nВыдан:_____________________\n\nАдрес: {owner.address}\n\nТелефон:+  {owner.phone}"],["Исполнитель:","Заказчик:"],["____________________________________________________________","____________________________________________________________"]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":true,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"5414","reviewStatus":"LEGAL_REVIEW_REQUIRED"}'::jsonb,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · на юридическую проверку' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Договор на оказание услуг');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000005414',t."id",1,'VTF · на юридическую проверку',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · на юридическую проверку' AND t."title"='Договор на оказание услуг' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000019089',c."id",'Первичный тест (6 показателей)','Полное наименование | Сокращение | Норма кошка | Показатель | Норма собака | Единица измерения
Аспартатаминотрансфераза | AST |  |  |  | U/L
Аланин-аминотрансфераза | ALT |  |  |  | U/L
Щелочная фосфатаза | ALP |  |  |  | U/L
Креатинин | Crea |  |  |  | mmol/L
Мочевина | BUN |  |  |  | umol/L
Соотношение мочевина/креатинин | BUN/CREA |  |  |  | ','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Полное наименование","Сокращение","Норма кошка","Показатель","Норма собака","Единица измерения"],["Аспартатаминотрансфераза","AST","","","","U/L"],["Аланин-аминотрансфераза","ALT","","","","U/L"],["Щелочная фосфатаза","ALP","","","","U/L"],["Креатинин","Crea","","","","mmol/L"],["Мочевина","BUN","","","","umol/L"],["Соотношение мочевина/креатинин","BUN/CREA","","","",""]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"19089","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Первичный тест (6 показателей)');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000019089',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Первичный тест (6 показателей)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000018985',c."id",'Исследование мочи ( № 2 )','ПОКАЗАТЕЛЬ | РЕЗУЛЬТАТ
Уробилиноген | 
Билирубин | 
Кетоны | 
Креатинин | 
Эритроциты | 
Белок | 
Микроальбумин | 
Нитриты | 
Лейкоциты | 
Глюкоза | 
Относительная плотность | 
pH | 
Аскорбиновая кислота | 
Кальций | ','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["ПОКАЗАТЕЛЬ","РЕЗУЛЬТАТ"],["Уробилиноген",""],["Билирубин",""],["Кетоны",""],["Креатинин",""],["Эритроциты",""],["Белок",""],["Микроальбумин",""],["Нитриты",""],["Лейкоциты",""],["Глюкоза",""],["Относительная плотность",""],["pH",""],["Аскорбиновая кислота",""],["Кальций",""]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"18985","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Исследование мочи ( № 2 )');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000018985',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Исследование мочи ( № 2 )' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000017480',c."id",'Биохимический анализ почки','Тест | Результат | Нормы | Ед. Измерения |  | 
ALB |  | 22.0-44.0 | g/L |  | 
Crea |  | 45.0-278.0 | umol/L |  | 
UA |  | 0.00-60.00 | umol/L |  | 
BUN |  | 4.00-12.90 | mmol/L |  | 
BUN/CREA |  | 27.000-182.000 |  |  | 
GLU |  | 3.94-8.83 | mmol/L |  | 
tCO2 |  | 13.0-25.0 | mmol/L |  | 
Ca |  | 1.95-2.83 | mmol/L |  | 
PHOS |  | 1.00-2.42 | mmol/L |  | ','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Тест","Результат","Нормы","Ед. Измерения","",""],["ALB","","22.0-44.0","g/L","",""],["Crea","","45.0-278.0","umol/L","",""],["UA","","0.00-60.00","umol/L","",""],["BUN","","4.00-12.90","mmol/L","",""],["BUN/CREA","","27.000-182.000","","",""],["GLU","","3.94-8.83","mmol/L","",""],["tCO2","","13.0-25.0","mmol/L","",""],["Ca","","1.95-2.83","mmol/L","",""],["PHOS","","1.00-2.42","mmol/L","",""]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"17480","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Биохимический анализ почки');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000017480',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Биохимический анализ почки' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000016625',c."id",'Биохимический анализ зелёный диск','Полное наименование | Сокращение | Норма кошка | Показатель | Норма собака | Единица измерения
Альбумин | ALB | 22.0-44.0 |  | 25.0-44.0 | g/L
Белок общий | TP | 57.0-89.0 |  | 54-77 | g/L
Глобулин | GLOB | 23-52 |  | 19-45 | g/L
Альбумин/глобулин | A/G |  |  |  | 
Общий билирубин | TB | 0.0-15.0 |  | 0.0-15.0 | umol/L
Аспартатаминотрансфераза | AST | 0-48 |  |  | U/L
Аланин-аминотрансфераза | ALT | 5-130 |  |  | U/L
Амилаза | AMY | 500-1500 |  |  | U/L
Креатинкиназа | CK | 0-559 |  |  | U/L
Креатинин | Crea | 44.0-212.0 |  |  | umol/L
Мочевина | BUN | 4.00-12.90 |  |  | mmol/L
Соотношение мочевина/креатинин | BUN/CREA | 27.000-182.000 |  |  | 
Глюкоза | GLU | 4.11-8.83 |  |  | mmol/L
Тиреоглобулин | TG | 0.11-1.13 |  |  | mmol/L
Кальций | Ca | 1.95-2.83 |  |  | mmol/L
Фосфор | PHOS | 1.00-2.42 |  |  | mmol/L
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | ','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Полное наименование","Сокращение","Норма кошка","Показатель","Норма собака","Единица измерения"],["Альбумин","ALB","22.0-44.0","","25.0-44.0","g/L"],["Белок общий","TP","57.0-89.0","","54-77","g/L"],["Глобулин","GLOB","23-52","","19-45","g/L"],["Альбумин/глобулин","A/G","","","",""],["Общий билирубин","TB","0.0-15.0","","0.0-15.0","umol/L"],["Аспартатаминотрансфераза","AST","0-48","","","U/L"],["Аланин-аминотрансфераза","ALT","5-130","","","U/L"],["Амилаза","AMY","500-1500","","","U/L"],["Креатинкиназа","CK","0-559","","","U/L"],["Креатинин","Crea","44.0-212.0","","","umol/L"],["Мочевина","BUN","4.00-12.90","","","mmol/L"],["Соотношение мочевина/креатинин","BUN/CREA","27.000-182.000","","",""],["Глюкоза","GLU","4.11-8.83","","","mmol/L"],["Тиреоглобулин","TG","0.11-1.13","","","mmol/L"],["Кальций","Ca","1.95-2.83","","","mmol/L"],["Фосфор","PHOS","1.00-2.42","","","mmol/L"],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"16625","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Биохимический анализ зелёный диск');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000016625',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Биохимический анализ зелёный диск' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000010147',c."id",'Биохимический анализ крови расширенный','Полное наименование | Сокращение | Норма кошка | Показатель | Норма собака | Единица измерения
Альбумин | ALB | 22.0-43.0 |  | 25.0-44.0 | g/L
Белок общий | TP | 53.0-82.0 |  | 54-77 | g/L
Глобулин | GLOB | 23-52 |  | 19-45 | g/L
Альбумин/глобулин | A/G |  |  |  | 
Общий билирубин | TB | 0.0-15.0 |  | 0.0-15.0 | umol/L
Гамма-глютамилтранспептидаза | GGT | 0-8 |  |  | U/L
Аспартатаминотрансфераза | AST | 0-48 |  |  | U/L
Аланин-аминотрансфераза | ALT | 5-130 |  |  | U/L
Щелочная фосфатаза | ALP | 14-111 |  | 40-368 | U/L
Желчные кислоты | TBA | 0.00-9.00 |  | 44.0-159.0 | umol/L
Амилаза | AMY | 500-1500 |  |  | U/L
Липаза | LPS | 0-40 |  | 0.016-0.218 | U/L
Лактатдегидрогенеза | LDH | 0-798 |  | 4.11-7.94 | U/L
Креатинкиназа | CK | 0-559 |  | 0.22-1.20 | U/L
Креатинин | Crea | 44.0-212.0 |  | 1.98-3.00 | umol/L
Мочевая кислота | UA | 0.00-60.00 |  | 0.81-2.19 | umol/L
Мочевина | BUN | 4.00-12.90 |  |  | mmol/L
Соотношение мочевина/креатинин | BUN/CREA | 27.000-182.000 |  |  | 
Глюкоза | GLU | 4.11-8.83 |  |  | mmol/L
Общий холестерин | TC | 1.68-5.81 |  |  | mmol/L
Тиреоглобулин | TG | 0.11-1.13 |  |  | mmol/L
Тромбоэластограмма | tCO2 | 13.0-25.0 |  |  | mmol/L
Кальций | Ca | 1.95-2.83 |  |  | mmol/L
Фосфор | PHOS | 1.00-2.42 |  |  | mmol/L','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Полное наименование","Сокращение","Норма кошка","Показатель","Норма собака","Единица измерения"],["Альбумин","ALB","22.0-43.0","","25.0-44.0","g/L"],["Белок общий","TP","53.0-82.0","","54-77","g/L"],["Глобулин","GLOB","23-52","","19-45","g/L"],["Альбумин/глобулин","A/G","","","",""],["Общий билирубин","TB","0.0-15.0","","0.0-15.0","umol/L"],["Гамма-глютамилтранспептидаза","GGT","0-8","","","U/L"],["Аспартатаминотрансфераза","AST","0-48","","","U/L"],["Аланин-аминотрансфераза","ALT","5-130","","","U/L"],["Щелочная фосфатаза","ALP","14-111","","40-368","U/L"],["Желчные кислоты","TBA","0.00-9.00","","44.0-159.0","umol/L"],["Амилаза","AMY","500-1500","","","U/L"],["Липаза","LPS","0-40","","0.016-0.218","U/L"],["Лактатдегидрогенеза","LDH","0-798","","4.11-7.94","U/L"],["Креатинкиназа","CK","0-559","","0.22-1.20","U/L"],["Креатинин","Crea","44.0-212.0","","1.98-3.00","umol/L"],["Мочевая кислота","UA","0.00-60.00","","0.81-2.19","umol/L"],["Мочевина","BUN","4.00-12.90","","","mmol/L"],["Соотношение мочевина/креатинин","BUN/CREA","27.000-182.000","","",""],["Глюкоза","GLU","4.11-8.83","","","mmol/L"],["Общий холестерин","TC","1.68-5.81","","","mmol/L"],["Тиреоглобулин","TG","0.11-1.13","","","mmol/L"],["Тромбоэластограмма","tCO2","13.0-25.0","","","mmol/L"],["Кальций","Ca","1.95-2.83","","","mmol/L"],["Фосфор","PHOS","1.00-2.42","","","mmol/L"]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"10147","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Биохимический анализ крови расширенный');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000010147',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Биохимический анализ крови расширенный' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000010098',c."id",'Исследование мочи','Показатель | Норма | Результат |  |  | 
Лейкоциты |  |  |  |  | 
Эритроциты |  |  |  |  | 
Кетоны |  |  |  |  | 
Белок |  |  |  |  | 
Нитриты |  |  |  |  | 
Билирубин |  |  |  |  | 
Уробилиноген |  |  |  |  | 
Глюкоза |  |  |  |  | 
pH |  |  |  |  | 
Удельный вес |  |  |  |  | 
Аскорбиновая кислота |  |  |  |  | 
 |  |  |  |  | 
Микроскопия осадка |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | ','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Показатель","Норма","Результат","","",""],["Лейкоциты","","","","",""],["Эритроциты","","","","",""],["Кетоны","","","","",""],["Белок","","","","",""],["Нитриты","","","","",""],["Билирубин","","","","",""],["Уробилиноген","","","","",""],["Глюкоза","","","","",""],["pH","","","","",""],["Удельный вес","","","","",""],["Аскорбиновая кислота","","","","",""],["","","","","",""],["Микроскопия осадка","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"10098","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Исследование мочи');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000010098',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Исследование мочи' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000010078',c."id",'Биохимический анализ крови жёлтый диск','Полное наименование | Сокращение | Норма кошка | Показатель | Норма собака | Единица измерения
Альбумин | ALB | 22.0-43.0 |  | 25.0-44.0 | g/L
Белок общий | TP | 53.0-82.0 |  | 54-77 | g/L
Глобулин | GLOB | 23-52 |  | 19-45 | g/L
Альбумин/глобулин | A/G |  |  |  | 
Общий билирубин | TB | 0.0-15.0 |  | 0.0-15.0 | umol/L
Аланин-аминотрансфераза | ALT | 5-115 |  | 10-118 | U/L
Щелочная фосфатаза | ALP | 14-192 |  | 10-80 | U/L
Холинэстераза | CHE | 736-3016 |  | 2200-4900 | U/L
Амилаза | AMY | 500-1500 |  | 200-1200 | U/L
Креатинин | Crea | 25.0-141.0 |  | 44.0-159.0 | umol/L
Мочевая кислота | U/A | 0-60 |  | 9-60 | umol/L
Мочевина | BUN | 4.00-11.80 |  | 2.50-9.60 | mmol/L
Мочевина/Креатинин | BUN/CREA | 27.0-182.0 |  | 0.016-0.218 | 
Глюкоза | GLU | 4.28-8.50 |  | 4.11-7.94 | mmol/L
Калий | K | 3.50-5.80 |  | 3.70-5.80 | mmol/L
Натрий | Na | 140-160 |  | 142-155 | mmol/L
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | 
 |  |  |  |  | ','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Полное наименование","Сокращение","Норма кошка","Показатель","Норма собака","Единица измерения"],["Альбумин","ALB","22.0-43.0","","25.0-44.0","g/L"],["Белок общий","TP","53.0-82.0","","54-77","g/L"],["Глобулин","GLOB","23-52","","19-45","g/L"],["Альбумин/глобулин","A/G","","","",""],["Общий билирубин","TB","0.0-15.0","","0.0-15.0","umol/L"],["Аланин-аминотрансфераза","ALT","5-115","","10-118","U/L"],["Щелочная фосфатаза","ALP","14-192","","10-80","U/L"],["Холинэстераза","CHE","736-3016","","2200-4900","U/L"],["Амилаза","AMY","500-1500","","200-1200","U/L"],["Креатинин","Crea","25.0-141.0","","44.0-159.0","umol/L"],["Мочевая кислота","U/A","0-60","","9-60","umol/L"],["Мочевина","BUN","4.00-11.80","","2.50-9.60","mmol/L"],["Мочевина/Креатинин","BUN/CREA","27.0-182.0","","0.016-0.218",""],["Глюкоза","GLU","4.28-8.50","","4.11-7.94","mmol/L"],["Калий","K","3.50-5.80","","3.70-5.80","mmol/L"],["Натрий","Na","140-160","","142-155","mmol/L"],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"10078","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Биохимический анализ крови жёлтый диск');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000010078',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Биохимический анализ крови жёлтый диск' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "DocumentTemplate" ("id","categoryId","title","body","layout","variables","requiresSignature","currentVersion","createdAt","updatedAt") SELECT 'a2000000-0000-4000-8000-000000006256',c."id",'Общий анализ крови','Полное наименование | Сокращение | Норма кошка | Показатель | Норма собака | Единица измерения
Число белых клеток | WBS | 5.5-19.5 |  | 6,0-17,0 | 10^9/L
Нейтрофилы,% | Neu% | 38.0-80.0 |  | 52,0-81,0 | %
Лимфоциты,% | LYM% | 12.0-45.0 |  | 12,0-33,0 | %
Моноциты,% | MON% | 1.0-8.0 |  | 2,0-13,0 | %
Эзинофилы | Eos% | 1.0-11.0 |  | 0,5-10,0 | %
Базофилы | Bas% | 0.0-1.2 |  | 0,0-1,3 | %
Нейтрофилы | Neu# | 3.12-12.58 |  | 3,62-12,30 | 10^9/L
Лимфоциты | LYM# | 0.73-7.86 |  | 0,83-4,91 | 10^9/L
Моноциты | MON# | 0.07-1.36 |  | 0,14-1,97 | 10^9/L
Эозинофилы | Eos# | 0.06-1.93 |  | 0,04-1,62 | 10^9/L
Базофилы | Bas# | 0-0.12 |  | 0,00-0,12 | 10^9/L
Эритроциты | RBC | 4.6-10.0 |  | 5,10-8,50 | 10^12/L
Концентрация гемоглобина | HGB | 85-153 |  | 110-190 | г/л
Гематокрит(относительный объём форменных элементов) | HCT | 26.0-47.0 |  | 33,0-56,0 | %
Средний объём эритроцитов | MCV | 38.0-54.0 |  | 60,0-76,0 | fL
Среднее значение гемоглобина в клетке | MCH | 11.8-18.0 |  | 20,0-27,0 | пг
Средняя концентрация клеточного гемоглобина | MCHC | 290-360 |  | 300-380 | г/л
Точность повторения ширины распределения эритроцитов | RDW_CV | 16.0-23.0 |  | 12,5-17,2 | %
Ширина распределения эритроцитов | RDW_SD | 26.4-43.1 |  | 33,2-46,3 | fL
Тромбоциты | PLT | 100-518 |  | 117-490 | 10^9/L
Средний объём тромбоцитов | MPV | 9.9-16.8 |  | 8-14,1 | fL
Ширина распределения тромбоцитов по объёму | PDW | 12.0-17.5 |  | 12,0-17,5 | fL
Относительный объём тромбоцитов | PCT | 0.0 |  | 0,090-0,580 | %','{"blocks":[{"headerRows":1,"id":"vtf-table-1","rows":[["Полное наименование","Сокращение","Норма кошка","Показатель","Норма собака","Единица измерения"],["Число белых клеток","WBS","5.5-19.5","","6,0-17,0","10^9/L"],["Нейтрофилы,%","Neu%","38.0-80.0","","52,0-81,0","%"],["Лимфоциты,%","LYM%","12.0-45.0","","12,0-33,0","%"],["Моноциты,%","MON%","1.0-8.0","","2,0-13,0","%"],["Эзинофилы","Eos%","1.0-11.0","","0,5-10,0","%"],["Базофилы","Bas%","0.0-1.2","","0,0-1,3","%"],["Нейтрофилы","Neu#","3.12-12.58","","3,62-12,30","10^9/L"],["Лимфоциты","LYM#","0.73-7.86","","0,83-4,91","10^9/L"],["Моноциты","MON#","0.07-1.36","","0,14-1,97","10^9/L"],["Эозинофилы","Eos#","0.06-1.93","","0,04-1,62","10^9/L"],["Базофилы","Bas#","0-0.12","","0,00-0,12","10^9/L"],["Эритроциты","RBC","4.6-10.0","","5,10-8,50","10^12/L"],["Концентрация гемоглобина","HGB","85-153","","110-190","г/л"],["Гематокрит(относительный объём форменных элементов)","HCT","26.0-47.0","","33,0-56,0","%"],["Средний объём эритроцитов","MCV","38.0-54.0","","60,0-76,0","fL"],["Среднее значение гемоглобина в клетке","MCH","11.8-18.0","","20,0-27,0","пг"],["Средняя концентрация клеточного гемоглобина","MCHC","290-360","","300-380","г/л"],["Точность повторения ширины распределения эритроцитов","RDW_CV","16.0-23.0","","12,5-17,2","%"],["Ширина распределения эритроцитов","RDW_SD","26.4-43.1","","33,2-46,3","fL"],["Тромбоциты","PLT","100-518","","117-490","10^9/L"],["Средний объём тромбоцитов","MPV","9.9-16.8","","8-14,1","fL"],["Ширина распределения тромбоцитов по объёму","PDW","12.0-17.5","","12,0-17,5","fL"],["Относительный объём тромбоцитов","PCT","0.0","","0,090-0,580","%"]],"type":"table"}],"page":{"fontSize":11,"lineGap":3,"marginBottom":52,"marginLeft":52,"marginRight":52,"marginTop":48,"showClinicHeader":true,"showSignatures":false,"showVisitMeta":false},"schemaVersion":1}'::jsonb,'{"source":"VTF","sourceId":"6256","reviewStatus":"MANUAL_FORM"}'::jsonb,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplateCategory" c WHERE c."title"='VTF · лабораторные бланки (ручные)' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplate" t WHERE t."categoryId"=c."id" AND t."title"='Общий анализ крови');
INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","categoryTitle","title","body","layout","variables","requiresSignature","createdByName","publishedAt","createdAt") SELECT 'a3000000-0000-4000-8000-000000006256',t."id",1,'VTF · лабораторные бланки (ручные)',t."title",t."body",t."layout",t."variables",t."requiresSignature",'Импорт VTF',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate" t JOIN "DocumentTemplateCategory" c ON c."id"=t."categoryId" WHERE c."title"='VTF · лабораторные бланки (ручные)' AND t."title"='Общий анализ крови' AND NOT EXISTS (SELECT 1 FROM "DocumentTemplateVersion" v WHERE v."templateId"=t."id" AND v."version"=1);
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ЛОЖНАЯ БЕРЕМЕННОСТЬ','П/К - Мастометрин + Травматин по ; 
П/О - Лакто-Стоп мл. 

Рекомендации: 
1. Урезать кормление в 50%.
2. Активный моцион.
3. Лакто-Стоп (или Галастоп по мл. - Курс 4 - 7 дней.','e8991658586db1bcfd04f9aa3666031432d993be75e132a66b027bf4cffce603','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ОГЭ','Атропин - ; Анальгин - ; Димедрол - ; Медитин - ; Антимедин - ; Везотил - 
Фуросенит-вет - ; Эмицидин - ; Аскорбиновая кислота ; Конафлион - ; Амоксициллин - 

Рекомендации: 
1. Амоксициллин по мл. - 
2. Травматин - 
3. Аскорбиновая кислота - 

Рекомендации: 
1. Не допускать нализывания швов.
2. Ношение послеоперационной попоны или защитного воротника
3. Обработка швов водным раствором Хлоргексидина Биглюконата 0,05% 1-2 раза в день. При образовании корочек - аккуратно. 

Снятие швов -','895d8f21c8ecb162da28cb6128d0c91ea03180c0eb92f64ea51b6553c95e43aa','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ОТЕК ЛЁГКИХ','Rg-снимок - 
Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - Фуросемид - ; Эмицидин - ; Тонокард - ; Рибоксин - ; Панангин - 
Ректально : Габапентин мг. 
Кислородная камера.','34c749fcb10062000963a7698353df9d814c0b796488a8be0d1af06cc9eefd1e','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ПРОТИВОКАШЛЕВАЯ ТЕРАПИЯ','Противокашлевая терапия: 
1. Коделак ( с кодеином ) Аналог - Терпинкод табл. - 0,008 внутрь по 0,1 - 2 мг/кг 3 - 4 раза в сутки.
2. Бутамират внутрь по 0,5 - 2 мг / кг 3-4 раза в сутки ( Синекод сироп 1,5 мг/мл, Омнитус )
3. Либексин внутрь 10 мг/кг. 2 раза в сутки

Стероиды: 
1. Системно: Преднизолон 0,25 - 0,5 мг./кг.
2. Местно: ингаляции через спейсер или небулайзер.','b384542bf94f03c630a29faa82be7277d3495f4e9d5a8c2602bedd9b8b4aaa78','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ОТРАВЛЕНИЕ','Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Локка - Глюкоза 5% - ; Атропин - ; Супрастин - ; Антитокс - ; Тонокард - ; Эмицидин -; В6 - ; Магния Сульфат - ;','5aac8b5939ade70b85f9508710970c5508e83c20b202d9cc957c53e8fe5dbc44','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ПОСЛЕРОДОВАЯ ЭКЛАМПСИЯ','Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Лока - Глюкоза 5% - ; Кальция глюконат - ; Магния сульфат - ; Панангин - 
В/М - Литическая смесь по 
П/К - Кафорсен -','a3ecd30e2ee29bc9efcf66c169b994d04591eb645bb1bb4c3635f1df73540800','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ЧУМА ПЛОТОЯДНЫХ','ОАК - 
Тест на чуму плотоядных - 
Постановка в/в катетера; Измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Локка - Глюкоза 5% - ; В1 - (Чередовать с В6); Кальция глюконат - ; 
В/М - Кобактан - / Тилозин - ; Анандин - ; Супрастин - 
П/К - Гискан 1 доза','733113215f7c7f91330f98e3ccf0e80fcde9471788636a50963fdd17a403c642','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ДИРОФИЛЯРИОЗ','ОАК - 
Тест на дирофиляриоз - положительный. 
Микроскопия - 

Назначение:
1. Доксициклин (100мг) - 10 мг./кг. - по таб 1 р в день - 21 день
2. Рибоксин по 1 таб 2 р в день - 1 месяц
3. Панангин по 1 таб 2 р в день -14 дней.
4. Верошпирон (50мг) по таб. 1 р в день - 21 - 28 дней.
5. Диронет (по весу) - 1 р в месяц (пожизненно) или Инспектор квадро. 
6. Кардиомагнил по таб. ( в летний период ).','249a5b5ffb765ac8b7748c5b9b9ddfc1bd59b282cc8f5c6dff0d1f8e7c4f815f','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','КАСТРАЦИЯ','Атропин - ; Анальгин - ; Димедрол - ; Медитин - ; Антимедин - ; 
Фуросенит-вет - ; Эмицидин - ; Аскорбиновая кислота - ; Конафлион - ; Амоксициллин - 
Оперативное вмешательство : Орхиэктомия. 

Рекомендации в послеоперационном уходе: 
1. Не допускать нализывания послеоперационной раны. 
2. Ношение защитного воротника. 

На приём - ( осмотр раны )','b3bdc80dcad83c5d107882aca1c801bfda4f7a52655f2c5b8421fa001df530fb','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','БАБЕЗИОЗ','ОАК - 
Центрифугирование крови - гемолиз ( )
В/М - Литическая смесь по Супрастин - ; Конафлион - ; ПенСтреп - ; Гептрал - ; Пиро-стоп ( : )
П/К - В12 - ; Кантарен + Панкреалекс + Лиарсин по','0af77f7419d051b6406fc4f5b41b1123cf52bbd2a455da27decdc1d697326556','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ПАНЛЕЙКОПЕНИЯ','Тест на панлейкопению - положительный
Постановка в/в катетера; измерение уровня глюкозы - ммоль/л.
В/В - NaCI 0,9% - Рингера-Локка - Глюкоза 5% - ; Аскорбиновая кислота - ; Конафлион - ; Рибоксин - ; Панангин - ; Маропиталь - 
В/М - Тилозин - ; литическая смесь - ; Супрастин - ; Спазмамирал - ; Фелиферон 1,0
П/К - Глобфел 1 доза

Прогноз : осторожный - неблагоприятный
На приём -','ed90c4571fd1256cd4f3634ddaedc62eb3596a53cbc76fcc3a4c0f6e47538738','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.exam.anamnesis','VTF · Осмотр','АНАМНЕЗ','Жалобы: 

Условия содержания - 
Вакцинации - 
Обработка от экто- и эндопаразитов - 
Кормление - 
Статус репродукции - 
Хронические заболевания -','435e908445f2d2a51dfed2fa850464611f01024b731dcd1a17cf915999db274b','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.recommendation.treatmentPlan','VTF · План лечения','ПАРВОВИРУСНЫЙ ЭНТЕРИТ','Тест на парвовирусный энтерит - положительный.
Постановка в/в катетера; измерение уровня глюкозы - ммоль/л. 
в/в NaCI 0,9% - ; Рингера-Локка - ; Глюкоза 5% - ; Аскорбиновая кислота - ; Конафлион - ; Рибоксин - ; Панангин - ; Маропиталь - 
в/м Литическая смесь по ; Тилозин - ; Супрастин - ; Спазмамирал - ; Догферон - ; 
п/к Гискан 1 доза

Прогноз : осторожный - неблагоприятный
На приём -','8f4684bbbeaae9af9adfaa8c8390e2b4f41ff8582c96d286eb998877fcf840b5','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "MedicalPhrase" ("id","field","category","title","text","textHash","source","scopeKey","isActive","isAccepted","isPinned","usageCount","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'visit.exam.examination','VTF · Осмотр','БЛАНК ОСМОТРА','ЧСС - 
ЧДД - 
Видимые слизистые оболочки - 
Тургор кожи и состояние шерсти - 
Лимфатические узлы - 
Пальпация области живота - 
Мочевой пузырь - 
Почки -','ce53c3c3ee7e10ded2678759f39183b9d323b7e5ba3915526cf2e26356460aef','SYSTEM','system',true,false,false,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("field","scopeKey","textHash") DO NOTHING;
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'TELEGRAM','appointment_reminder','Напоминание о записи','🐾 {organization.orgType} «{organization.displayName}»
Напоминаем о записи на приём пациента «{animal.nickname}»
🕒 {appointment.time} {appointment.date}
📞 Контактный телефон: {office.phone}','["organization.orgType","organization.displayName","animal.nickname","appointment.time","appointment.date","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'TELEGRAM','revaccination_reminder','Напоминание о вакцинации','💉 Напоминание о вакцинации
Пациент: «{animal.nickname}»
{organization.orgType} «{organization.displayName}»
📞 Контактный телефон: {office.phone}','["animal.nickname","organization.orgType","organization.displayName","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'MAX','appointment_reminder','Напоминание о записи','🐾 {organization.orgType} «{organization.displayName}»
Напоминаем о записи на приём пациента «{animal.nickname}»
🕒 {appointment.time} {appointment.date}
📞 Контактный телефон: {office.phone}','["organization.orgType","organization.displayName","animal.nickname","appointment.time","appointment.date","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'MAX','revaccination_reminder','Напоминание о вакцинации','💉 Напоминание о вакцинации
Пациент: «{animal.nickname}»
{organization.orgType} «{organization.displayName}»
📞 Контактный телефон: {office.phone}','["animal.nickname","organization.orgType","organization.displayName","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'PUSH','appointment_reminder','Напоминание о записи','🐾 {organization.orgType} «{organization.displayName}»
Напоминаем о записи на приём пациента «{animal.nickname}»
🕒 {appointment.time} {appointment.date}
📞 Контактный телефон: {office.phone}','["organization.orgType","organization.displayName","animal.nickname","appointment.time","appointment.date","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'PUSH','revaccination_reminder','Напоминание о вакцинации','💉 Напоминание о вакцинации
Пациент: «{animal.nickname}»
{organization.orgType} «{organization.displayName}»
📞 Контактный телефон: {office.phone}','["animal.nickname","organization.orgType","organization.displayName","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'SMS','appointment_reminder','Короткое напоминание о записи','{organization.displayName}: {animal.nickname} записан на {appointment.time} {appointment.date}. Телефон: {office.phone}','["organization.displayName","animal.nickname","appointment.time","appointment.date","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');
INSERT INTO "NotificationTemplate" ("id","channel","eventCode","title","body","variables","isActive","createdAt","updatedAt") VALUES (gen_random_uuid()::text,'SMS','revaccination_reminder','Короткое напоминание о вакцинации','{organization.displayName}: пациенту {animal.nickname} пора на вакцинацию. Телефон: {office.phone}','["organization.displayName","animal.nickname","office.phone"]'::jsonb,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("channel","eventCode") DO UPDATE SET "title"=EXCLUDED."title","body"=EXCLUDED."body","variables"=EXCLUDED."variables","isActive"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "NotificationTemplate"."body" IN ('Здравствуйте, {owner.fullName}. Напоминаем о записи пациента {animal.nickname} на {appointment.startsAt}.','Здравствуйте, {owner.fullName}. Пациенту {animal.nickname} пора на ревакцинацию: {vaccination.title}.','{owner.fullName}, запись {animal.nickname}: {appointment.startsAt}. TemichevVet.');

-- Configurable daily director briefing. The report is generated from CRM facts only and never changes clinical or financial records.
ALTER TABLE "Organization" ADD COLUMN "directorBriefingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "directorBriefingTime" TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE "Organization" ADD COLUMN "directorBriefingTimezone" TEXT NOT NULL DEFAULT 'Europe/Moscow';
CREATE TABLE "DirectorBriefing" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "rangeFrom" TIMESTAMP(3) NOT NULL,
  "rangeTo" TIMESTAMP(3) NOT NULL,
  "trigger" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorBriefing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectorBriefing_organizationId_businessDate_key" ON "DirectorBriefing"("organizationId", "businessDate");
CREATE INDEX "DirectorBriefing_createdAt_idx" ON "DirectorBriefing"("createdAt");
ALTER TABLE "DirectorBriefing" ADD CONSTRAINT "DirectorBriefing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorBriefing" ADD CONSTRAINT "DirectorBriefing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
