import { Schema, MapSchema, type } from "@colyseus/schema";

/** One connected participant on the shared vessel. */
export class Player extends Schema {
  @type("string") id = "";
  @type("string") role = "unassigned";
  @type("string") device = "";
  @type("string") name = "";
}

/** Authoritative room state, synced to all clients. M0 only tracks who's here. */
export class GameState extends Schema {
  @type("string") code = "";
  @type({ map: Player }) players = new MapSchema<Player>();
}
