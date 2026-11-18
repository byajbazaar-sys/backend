# Backend code structure & conventions

> How the NestJS backend is organised, the rules every change follows, and a step-by-step walkthrough for adding a
> feature. The `users` feature (`src/application/features/users/`) is the reference — copy its shape.

## 1. The layers, in plain words

The code is split so that **business logic never depends on a database or an outside service directly**.

| Layer | Path | What goes here | May import |
| --- | --- | --- | --- |
| **Application** | `src/application/`, `src/marketing/application/` | Controllers, services, request/response models, domain types, and **interfaces** ("ports") for anything outside | Its own shared code and `libs/` — **never** infrastructure |
| **Infrastructure** | `src/infrastructure/`, `src/marketing/infrastructure/` | TypeORM entities and repositories, AWS (S3, Lambda), Redis, external APIs (Kaggle, Instagram, Meta), cron jobs, crypto | Application (to implement its interfaces) |
| **Libraries** | `libs/` (imported as `@shared-libs`) | Generic helpers with no project knowledge (file storage, interceptors, AWS helpers) | Nothing project-specific |

How they connect: a service asks for an **interface** by a string token, and an infrastructure module provides the
real class for that token.

```ts
// application: service/i-users.repository.ts
export const USERS_REPOSITORY = 'USERS_REPOSITORY';
export interface IUsersRepository { findById(id: string): Promise<User | null>; }

// application: service/users.service.ts
constructor(@Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository) {}

// infrastructure: infrastructure.module.ts
{ provide: USERS_REPOSITORY, useClass: UsersRepository }
```

So you can swap the database (or mock it in a test) without touching the service.

**Two databases:** the main ByajBazaar database (`src/infrastructure/persistence`) and a **separate marketing
database** (`src/marketing/infrastructure/persistence`) with its own entities, migrations and migrations table.

## 2. Feature folder layout

```
features/<feature>/
  index.ts                     # barrel: export * from './…'
  <feature>.controller.ts      # HTTP routes only — no business logic
  domain/                      # domain types, one per file
  models/                      # HTTP models, one per file
    create-<x>-request.model.ts
    <x>-response.model.ts
    internal-models/           # models never exposed over HTTP
  service/
    i-<feature>.repository.ts  # interface + DI token, implemented in infrastructure
    i-<feature>.service.ts
    <feature>.service.ts       # the business logic
  utils/                       # pure helpers
```

Marketing follows the same shape: `src/marketing/application/features/{campaigns,photoshoots,instagram,kaggle,queue}`
plus shared code in `src/marketing/application/shared/{domain,enums,ports,models,services,utils}`.

## 3. The rules

1. **Separate request and response models** (`*-request.model.ts`, `*-response.model.ts`). Validation decorators
   (`@IsString`, `@IsIn`, …) go on request models; response models are what Swagger shows.
2. **One declaration per file.** Every interface, type, enum, domain type and model has its own file, named after it
   in kebab-case: `IUsersRepository` → `i-users.repository.ts`, `MarketingImageMode` → `marketing-image-mode.ts`.
3. **Every folder has an `index.ts`** with only `export * from './<file>';` lines.
4. **Import from the folder, not the file.** Use the nearest folder: `from '../models'`, not
   `from '../models/create-user-request.model'`. Merge everything from one folder into one import line.
5. **Register, don't list.** New controllers/services go in `src/application/features/features.registry.ts`
   (`Controllers`, `Services`); entities in `entities/entities.registry.ts` (`ENTITIES`); cron jobs in
   `cron.registry.ts` (`CRON_SERVICES`); seeds in `seeds.registry.ts` (`SEEDS`).
6. **The API validates strictly.** `main.ts` uses `whitelist: true, forbidNonWhitelisted: true`: a request with a
   field the model doesn't declare is rejected with 400. Declare every field a client sends.
7. **Responses are wrapped** by `GlobalResponseInterceptor` as `{ statusCode, message, data }`. Clients (including
   the Kaggle notebooks) read `data`.

## 4. Barrel order (important — avoids `undefined` at startup)

When two `index.ts` files import each other in a loop, Node hands out a half-loaded module. Decorators run while the
class is defined, so an `@Inject(TOKEN)` or `@IsEnum(Enum)` that comes from a half-loaded barrel gets `undefined` —
Nest then fails with "can't resolve dependencies", or validation crashes.

Order the lines in every barrel like this:

1. `i-*` interfaces and DI tokens
2. `enums`
3. `constants`
4. `domain`
5. `utils`
6. `options`
7. `models`
8. `service`
9. other sub-folders
10. other files
11. controllers and modules **last**

If a loop still bites, move the shared piece one level down (for example the phone util moved to
`application/shared/utils`) instead of importing a sibling feature's barrel.

Known harmless leftover: `DueResponseModel` ↔ `TransactionResponseModel` import each other; `design:type` is
`undefined` there, but both use `@Type(() => …)`, so serialisation works.

## 5. Walkthrough: adding a feature, step by step

Example: a "notes" feature with `POST /api/v1/notes` and `GET /api/v1/notes/:id`.

1. **Create the folders** under `src/application/features/notes/`: `domain/`, `models/`, `service/`, each with an
   `index.ts`.
2. **Domain type** — `domain/note.ts`:
   ```ts
   export interface Note { id: string; userId: string; text: string; createdAt: Date; }
   ```
3. **Port (interface + token)** — `service/i-notes.repository.ts`:
   ```ts
   import { Note } from '../domain';
   export const NOTES_REPOSITORY = 'NOTES_REPOSITORY';
   export interface INotesRepository {
     create(note: Omit<Note, 'id' | 'createdAt'>): Promise<Note>;
     findById(id: string): Promise<Note | null>;
   }
   ```
4. **Models** — `models/create-note-request.model.ts` (with `@IsString()` etc.) and
   `models/note-response.model.ts` (with `@ApiProperty()` / `@Expose()`), one class per file.
5. **Service** — `service/notes.service.ts`, injecting `@Inject(NOTES_REPOSITORY)`. Business rules live here.
6. **Controller** — `notes.controller.ts`: routes only, calls the service, returns response models.
7. **Barrels** — fill every `index.ts` with `export * from './…'` in the order of section 4; the feature's own
   `index.ts` exports `service`, `models`, `domain` … and the controller last.
8. **Infrastructure** — `src/infrastructure/persistence/entities/note.entity.ts` (add it to `ENTITIES`), a
   repository class implementing `INotesRepository`, and the provider `{ provide: NOTES_REPOSITORY, useClass: … }`
   in `infrastructure.module.ts` (exported).
9. **Register** the controller and service in `features.registry.ts`.
10. **Migration** — `npm run migration:create` (main DB) or `npm run marketing:migration:create` (marketing DB), write
    the `up`/`down` SQL, then `npm run migration:up` (or `marketing:migration:up`). Deploys run them in post-deploy.
11. **Check** with section 6.

## 6. Checking your change

```bash
npx tsc --noEmit -p tsconfig.json          # 0 errors (the upstox typings error is pre-existing)
npx eslint <the files you changed>         # no new errors
yarn start:dev                             # the app boots: no "can't resolve dependencies"
```

If you touched a barrel, also make sure every entry point still starts (`main.ts`, the Lambda handlers in
`src/lambda-handlers/`, the CLI data sources).

If you touched a Kaggle notebook builder, build the notebook and `python3 -m py_compile` it — see
[MARKETING_KAGGLE_PIPELINE.md § 11](MARKETING_KAGGLE_PIPELINE.md#11-how-to-common-tasks).
