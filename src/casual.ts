// This process is a casual-lobby client. Tournament registration is not
// implemented, and a set TOURNAMENT_ID is a hard startup error so a shared
// shell environment cannot enroll this persona by accident.

const REFUSAL_LEAD =
  "Refusing to start: TOURNAMENT_ID is set. This bot plays casual lobby matches only and will not register for a tournament.";

export function tournamentRefusal(env: NodeJS.ProcessEnv): string | null {
  if (!Object.prototype.hasOwnProperty.call(env, "TOURNAMENT_ID")) return null;
  const shown = JSON.stringify(env.TOURNAMENT_ID ?? "");
  return (
    `${REFUSAL_LEAD} Unset TOURNAMENT_ID (current value ${shown}) and start again. ` +
    "Create a new team and token at https://scrabblebot.spacetimedb.com/team/new " +
    "so this process does not share a bot persona with a tournament entry."
  );
}
