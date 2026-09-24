import { requireUser } from "@/lib/auth/session";
import { scopedFor } from "@/lib/db/scoped";
import { sortCards } from "@/lib/board/sort";
import { Board, BoardViewSwitch } from "@/components/board/board";
import { PhoneBoard } from "@/components/board/phone-board";
import { ClosedList } from "@/components/board/closed-list";
import { RefreshOnFocus } from "@/components/refresh-on-focus";

export default async function BoardPage(props: PageProps<"/board">) {
  const user = await requireUser();
  const searchParams = await props.searchParams;
  const view = searchParams.view === "closed" ? "closed" : "active";
  const s = scopedFor(user.id);
  const nowIso = new Date().toISOString();
  const companyNames = (await s.company.list()).map((c) => c.name);
  const activeCards = view === "active" ? sortCards(await s.opportunity.listBoard()) : [];

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Board</h1>
      <p className="mt-2 hidden text-muted-foreground md:block">Keys 1 to 7 move the focused job. C closes it.</p>
      <div className="mt-4">
        <BoardViewSwitch view={view} />
      </div>
      {view === "closed" ? (
        <ClosedList cards={await s.opportunity.listClosed()} />
      ) : (
        <>
          <Board cards={activeCards} nowIso={nowIso} companyNames={companyNames} />
          <PhoneBoard cards={activeCards} nowIso={nowIso} companyNames={companyNames} />
        </>
      )}
      <RefreshOnFocus />
    </div>
  );
}
