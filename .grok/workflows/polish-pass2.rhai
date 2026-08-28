let meta = #{
    name: "polish-pass2",
    description: "Smash-hold, shield, dodge, fighter identity, named lobby and dual rematch",
    when_to_use: "After polish-feel; run for smash-hold/shield/dodge and lobby ready-up",
    phases: [
        #{ title: "Moves", detail: "Smash charge, shield, dodge in sim/input" },
        #{ title: "Identity", detail: "Crests, visor, shield bubble in engine.ts" },
        #{ title: "Lobby", detail: "Names, ready-up, both-player rematch, extra sfx" },
        #{ title: "Verify", detail: "tsc, eslint, mechanic sanity" },
    ],
};

let impl_schema = #{
    "type": "object",
    "required": ["done", "files", "notes"],
    "properties": #{
        "done": #{ "type": "boolean" },
        "files": #{ "type": "array", "items": #{ "type": "string" } },
        "notes": #{ "type": "string" },
    },
};

let verify_schema = #{
    "type": "object",
    "required": ["ok", "problems"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "problems": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

phase("Moves");
log("Moves and identity agents run in parallel with disjoint files.");

let moves_prompt = "";
moves_prompt += "Implement SMASHBRO pass-2 combat at /home/jack/workspace/smashbro. ";
moves_prompt += "Read POLISH.md, src/lib/game/types.ts, sim.ts, input.ts with read_file before editing. ";
moves_prompt += "EDIT ONLY those three files. ";
moves_prompt += "Add IN.SHIELD. Map P1 KeyL and ShiftLeft; P2 ShiftRight and Numpad0. Keep existing move keys. ";
moves_prompt += "Smash: if ATTACK is held 12+ frames without releasing, attackKind becomes 3 (smash). Charge up to 45 frames. ";
moves_prompt += "On release or at cap, fire a larger melee hitbox; knockback and damage scale with charge. Push sfx smashcharge while charging (not every tick — once when charge starts) and smash on fire. ";
moves_prompt += "Jab stays attackKind 1 on a tap shorter than 12 frames. ";
moves_prompt += "Shield: while SHIELD held, grounded or aerial, not in hitstun/attack: shielding=true, slow movement, cut incoming knockback to ~0.35, drain shieldHp on hit. Regenerates when not shielding. At 0, shieldbreak sfx and long stun. ";
moves_prompt += "Dodge: on SHIELD press edge plus LEFT/RIGHT/DOWN, start dodge ~12 frames invuln, 20 frame endlag, consume airDodge until land. Push sfx dodge. Push sfx shield when shield starts (not dodge). ";
moves_prompt += "Clone/apply/createMatch must include new fighter fields with safe defaults. Dummy AI may shield or smash sometimes. ";
moves_prompt += "Return {done, files, notes}.";

let look_prompt = "";
look_prompt += "Give SMASHBRO fighters identity at /home/jack/workspace/smashbro. ";
look_prompt += "Read POLISH.md and src/lib/render/engine.ts and src/lib/game/types.ts with read_file first. ";
look_prompt += "EDIT ONLY src/lib/render/engine.ts. ";
look_prompt += "Keep configureSwapchain, autoResize false, no compile() on the canvas surface. ";
look_prompt += "Ember (slot 0): coral body plus a small flame crest (cone or stretched sphere) on the head. ";
look_prompt += "Volt (slot 1): cyan body plus side visor fins. ";
look_prompt += "If fighter.shielding, draw a translucent bubble (additive or alpha) around the body. ";
look_prompt += "If smashCharge>0 or attackKind===3, pulse emissive. Dodge: extra stretch along velocity. ";
look_prompt += "Read new optional fields defensively (shielding, smashCharge, dodge) so missing fields do not crash. ";
look_prompt += "Return {done, files, notes}.";

let panel = parallel([
    #{ prompt: moves_prompt, label: "moves", capability_mode: "all", output_schema: impl_schema },
    #{ prompt: look_prompt, label: "identity", capability_mode: "all", output_schema: impl_schema },
]);

if (!(panel[0] != () && panel[0].success && panel[0].output.done == true)) { log("Moves agent did not finish cleanly."); }
if (!(panel[1] != () && panel[1].success && panel[1].output.done == true)) { log("Identity agent did not finish cleanly."); }

phase("Lobby");
let lobby_prompt = "";
lobby_prompt += "Wire SMASHBRO lobby names, ready-up, rematch, and new sfx at /home/jack/workspace/smashbro. ";
lobby_prompt += "Read POLISH.md, Lobby.tsx, GameView.tsx, HUD.tsx, src/lib/net/protocol.ts, client.ts, src/lib/audio/sfx.ts, src/lib/game/input.ts with read_file first. ";
lobby_prompt += "EDIT ONLY: src/components/Lobby.tsx, GameView.tsx, HUD.tsx, src/lib/net/protocol.ts, src/lib/net/client.ts, src/lib/audio/sfx.ts. ";
lobby_prompt += "Lobby: name input persisted in sessionStorage key smashbro.playerName. Create/join still go to /r/CODE. Local/training unchanged aside from showing the name later. ";
lobby_prompt += "GameView online: connectRoom name from sessionStorage (fallback Fighter). HUD titles like 'Ada · Ember'. ";
lobby_prompt += "Online: do not run countdown/start until both players sent {type:'ready'}. Add ready to ClientEvent. Show Ready button in HUD while waiting. Local and training start as they do today. ";
lobby_prompt += "Rematch: each click sends rematch; host only resetMatch when both slots have requested this round. HUD shows waiting for opponent. ";
lobby_prompt += "HUD controls hint: Shield L/Shift, hold J to smash. ";
lobby_prompt += "sfx.ts: add voices smash, smashcharge, shield, dodge, shieldbreak if missing. Keep play() ignoring unknown names. ";
lobby_prompt += "Do not break WebSocket/SSE or snapshot netcode. Return {done, files, notes}.";

let wired = agent(lobby_prompt, #{ label: "lobby-ux", capability_mode: "all", output_schema: impl_schema });
if (wired == () || !wired.success || wired.output.done != true) {
    log("Lobby agent had problems; verify will list them.");
}

phase("Verify");
let verify_prompt = "";
verify_prompt += "Verify SMASHBRO pass 2 at /home/jack/workspace/smashbro. ";
verify_prompt += "Use read_file, grep, run_terminal_command. Run ./node_modules/.bin/tsc --noEmit and ./node_modules/.bin/eslint src --max-warnings 0. ";
verify_prompt += "Confirm IN.SHIELD exists, smash/shield/dodge are simulated, engine draws crest/visor/shield bubble, ";
verify_prompt += "Lobby has a name field, GameView ready/rematch require both players online, sfx has smash/shield/dodge. ";
verify_prompt += "ok=true only if tsc+eslint pass and those features exist in code. Do not edit. Return {ok, problems}.";

let verified = agent(verify_prompt, #{ label: "verify", capability_mode: "execute", output_schema: verify_schema });
let ok = verified != () && verified.success && verified.output.ok == true;
let problems = [];
if (verified != () && verified.success && verified.output.problems != ()) {
    problems = verified.output.problems;
}

if (!ok) {
    phase("Fix");
    let fix_prompt = "";
    fix_prompt += "Fix SMASHBRO pass-2 issues at /home/jack/workspace/smashbro. ";
    fix_prompt += "Problems: " + json_encode(problems) + " ";
    fix_prompt += "Read the named files and edit them. Keep swapchain rules in engine.ts. ";
    fix_prompt += "Re-run ./node_modules/.bin/tsc --noEmit until it passes. Return {done, files, notes}.";
    let fixed = agent(fix_prompt, #{ label: "fix", capability_mode: "all", output_schema: impl_schema });
    if (fixed == () || !fixed.success) { log("Fix agent failed."); }
    let reverify = agent(verify_prompt, #{ label: "reverify", capability_mode: "execute", output_schema: verify_schema });
    ok = reverify != () && reverify.success && reverify.output.ok == true;
    if (reverify != () && reverify.success && reverify.output.problems != ()) {
        problems = reverify.output.problems;
    }
}

let report = "";
report += "# polish-pass2 result\n\n";
if (ok) {
    report += "Pass 2 complete: smash-hold, shield, dodge, fighter identity, named lobby, dual rematch.\n";
} else {
    report += "Pass 2 finished with problems.\n\n";
    report += json_encode(problems);
    report += "\n";
}
let path = write_scratch_file("report.md", report);
complete(#{ ok: ok, path: path, problems: problems });
