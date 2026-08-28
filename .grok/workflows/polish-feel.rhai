let meta = #{
    name: "polish-feel",
    description: "Add Web Audio SFX and procedural fighter animation, then wire events and verify",
    when_to_use: "After the smashbro MVP plays; run to add audio + character motion polish",
    phases: [
        #{ title: "Audio", detail: "Web Audio synth in src/lib/audio/sfx.ts" },
        #{ title: "Characters", detail: "Procedural idle/run/jump/attack in engine.ts" },
        #{ title: "Wire", detail: "Sim events, GameView playback, mute toggle" },
        #{ title: "Verify", detail: "Typecheck and sanity-read the owned files" },
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

phase("Audio");
log("Audio and character agents run in parallel with disjoint file ownership.");

let audio_prompt = "";
audio_prompt += "You are implementing audio for SMASHBRO at /home/jack/workspace/smashbro. ";
audio_prompt += "Read POLISH.md and the existing src/lib/game and src/components files with read_file/grep before editing. ";
audio_prompt += "CREATE src/lib/audio/sfx.ts only. Do not edit any other file. ";
audio_prompt += "Implement a small Web Audio synth (no binary samples, no downloads). ";
audio_prompt += "Export initSfx() which creates/resumes AudioContext on first call, ";
audio_prompt += "play(name: string, opts?: { gain?: number, detune?: number }) for: ";
audio_prompt += "jump, doublejump, land, jab, special, hit, ko, blast, tick, go, win. ";
audio_prompt += "Also export setMuted(boolean), isMuted(), unlockSfx() for a user-gesture resume. ";
audio_prompt += "Sounds must be short, punchy, distinct, and original. ";
audio_prompt += "After writing, re-read the file and fix TypeScript issues. ";
audio_prompt += "Return {done, files, notes}.";

let char_prompt = "";
char_prompt += "You are animating SMASHBRO fighters at /home/jack/workspace/smashbro. ";
char_prompt += "Read POLISH.md and src/lib/render/engine.ts plus src/lib/game/types.ts with read_file before editing. ";
char_prompt += "EDIT ONLY src/lib/render/engine.ts. Do not edit other files. ";
char_prompt += "Keep the vgpu pipeline (offscreen depth target, then composite to canvas, configureSwapchain, autoResize false). ";
char_prompt += "Drive motion from existing fighter fields: tick via match.tick, vx, grounded, attack, attackKind, squash, facing, hitstun, alive, y. ";
char_prompt += "Add idle breath, run stride + lean, jump stretch, land squash, jab punch with torso twist and rear arm, special wind-up, hitstun recoil. ";
char_prompt += "Add a second arm/fist so a run cycle reads. Ember stays coral, Volt stays cyan. ";
char_prompt += "Do not call compile() on the canvas surface; never enable autoResize. ";
char_prompt += "After editing, re-read engine.ts and keep TypeScript compiling. ";
char_prompt += "Return {done, files, notes}.";

let panel = parallel([
    #{ prompt: audio_prompt, label: "audio-synth", capability_mode: "all", output_schema: impl_schema },
    #{ prompt: char_prompt, label: "char-motion", capability_mode: "all", output_schema: impl_schema },
]);

let audio_ok = panel[0] != () && panel[0].success && panel[0].output.done == true;
let char_ok = panel[1] != () && panel[1].success && panel[1].output.done == true;
if (!audio_ok) { log("Audio agent did not finish cleanly."); }
if (!char_ok) { log("Character agent did not finish cleanly."); }

phase("Wire");
let wire_prompt = "";
wire_prompt += "You are wiring SMASHBRO audio events at /home/jack/workspace/smashbro. ";
wire_prompt += "Read POLISH.md, src/lib/audio/sfx.ts (if present), src/lib/game/types.ts, sim.ts, ";
wire_prompt += "src/components/GameView.tsx, and HUD.tsx using read_file before editing. ";
wire_prompt += "You may edit ONLY: src/lib/game/types.ts, src/lib/game/sim.ts, src/components/GameView.tsx, src/components/HUD.tsx. ";
wire_prompt += "Add sfx: string[] to Match and Snapshot (clone/apply it). ";
wire_prompt += "In sim.ts, push event names when: jump, double jump, land (vy was fast), jab start, special start, ";
wire_prompt += "successful hit, KO/blast, countdown integer change, match start (go), winner set (win). ";
wire_prompt += "Clear match.sfx after the host copies a snapshot for the network in GameView (after cloneSnapshot). Guest plays names from incoming snapshots. ";
wire_prompt += "GameView: call unlock/init on first key/pointer, play each sfx name, do not break netcode. ";
wire_prompt += "HUD: mute toggle that calls setMuted. Keep Ember/Volt labels. ";
wire_prompt += "If sfx.ts is missing, create a minimal stub that no-ops play() so the game still compiles. ";
wire_prompt += "Return {done, files, notes}.";

let wired = agent(wire_prompt, #{ label: "wire-sfx", capability_mode: "all", output_schema: impl_schema });
if (wired == () || !wired.success || wired.output.done != true) {
    log("Wire-up agent had problems; verify will list them.");
}

phase("Verify");
let verify_prompt = "";
verify_prompt += "Verify the SMASHBRO polish at /home/jack/workspace/smashbro. ";
verify_prompt += "Use read_file, grep, and run_terminal_command. ";
verify_prompt += "Run ./node_modules/.bin/tsc --noEmit and ./node_modules/.bin/eslint src --max-warnings 0. ";
verify_prompt += "Read src/lib/audio/sfx.ts, src/lib/render/engine.ts, src/lib/game/sim.ts, src/lib/game/types.ts, ";
verify_prompt += "src/components/GameView.tsx, src/components/HUD.tsx. ";
verify_prompt += "ok=true only if tsc passes, eslint passes, sfx.ts exists with play(), engine still presents via configureSwapchain and not autoResize, ";
verify_prompt += "and GameView plays sfx from match snapshots. ";
verify_prompt += "List concrete problems with file paths. Do not edit files. ";
verify_prompt += "Return {ok, problems}.";

let verified = agent(verify_prompt, #{ label: "verify", capability_mode: "execute", output_schema: verify_schema });

let ok = verified != () && verified.success && verified.output.ok == true;
let problems = [];
if (verified != () && verified.success && verified.output.problems != ()) {
    problems = verified.output.problems;
}

if (!ok) {
    phase("Fix");
    let fix_prompt = "";
    fix_prompt += "Fix SMASHBRO polish regressions at /home/jack/workspace/smashbro. ";
    fix_prompt += "Problems: " + json_encode(problems) + " ";
    fix_prompt += "Read the named files, then edit them. Keep file ownership: audio API in src/lib/audio/sfx.ts, ";
    fix_prompt += "motion in src/lib/render/engine.ts, events in sim/types/GameView/HUD. ";
    fix_prompt += "Re-run ./node_modules/.bin/tsc --noEmit until it passes. ";
    fix_prompt += "Return {done, files, notes}.";
    let fixed = agent(fix_prompt, #{ label: "fix", capability_mode: "all", output_schema: impl_schema });
    if (fixed == () || !fixed.success) {
        log("Fix agent failed.");
    }
    let reverify = agent(verify_prompt, #{ label: "reverify", capability_mode: "execute", output_schema: verify_schema });
    ok = reverify != () && reverify.success && reverify.output.ok == true;
    if (reverify != () && reverify.success && reverify.output.problems != ()) {
        problems = reverify.output.problems;
    }
}

let report = "";
report += "# polish-feel result\n\n";
if (ok) {
    report += "Pass 1 complete: synth SFX + procedural fighter motion wired through sim events.\n";
} else {
    report += "Pass 1 finished with problems.\n\n";
    report += json_encode(problems);
    report += "\n";
}
let path = write_scratch_file("report.md", report);
complete(#{ ok: ok, path: path, problems: problems });
