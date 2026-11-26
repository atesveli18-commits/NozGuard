import { Collection } from "discord.js";
import { VedoAuditGuard } from "../src/vedo/VedoAuditGuard";
import { VedoDatabase } from "../src/vedo/VedoDatabase";

const createMockGuild = (querenciaEditable: boolean = true) => {
  const guildRoles = new Collection<string, any>([
    ["guild_id", { id: "guild_id", editable: true }],
    ["role_admin", { id: "role_admin", editable: true }],
    ["1574857531069567079", { id: "1574857531069567079", editable: querenciaEditable }],
    ["999999999999999999", { id: "999999999999999999", editable: true }]
  ]);

  return {
    id: "guild_id",
    iconURL: () => null,
    roles: { cache: guildRoles },
    channels: { cache: new Collection<string, any>() }
  } as any;
};

describe("VedoAuditGuard Fallback Querencia Role Unit Tests", () => {
  beforeEach(() => {
    jest.spyOn(VedoDatabase, "logAction").mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should strip admin roles and assign Querencia role when member does not already have it", async () => {
    const querenciaId = "1574857531069567079";
    const guard = new VedoAuditGuard([], [], "", querenciaId);
    const guild = createMockGuild(true);

    const adminRole = { id: "role_admin", editable: true };
    const memberRolesCache = new Collection<string, any>([
      ["guild_id", { id: "guild_id", editable: true }],
      ["role_admin", adminRole]
    ]);

    const removeMock = jest.fn().mockResolvedValue(undefined);
    const addMock = jest.fn().mockResolvedValue(undefined);

    const member = {
      id: "member_1",
      user: { tag: "yetkili#0001" },
      roles: {
        cache: memberRolesCache,
        remove: removeMock,
        add: addMock
      }
    } as any;

    await guard.enforceAction(guild, member, "ban", 4, 3);

    expect(removeMock).toHaveBeenCalledTimes(1);
    const removedCollection = removeMock.mock.calls[0][0];
    expect(removedCollection.has("role_admin")).toBe(true);
    expect(removedCollection.has(querenciaId)).toBe(false);

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock.mock.calls[0][0].id).toBe(querenciaId);
  });

  it("should preserve existing Querencia role and avoid re-adding it", async () => {
    const querenciaId = "1574857531069567079";
    const guard = new VedoAuditGuard([], [], "", querenciaId);
    const guild = createMockGuild(true);

    const memberRolesCache = new Collection<string, any>([
      ["guild_id", { id: "guild_id", editable: true }],
      ["role_admin", { id: "role_admin", editable: true }],
      [querenciaId, { id: querenciaId, editable: true }]
    ]);

    const removeMock = jest.fn().mockResolvedValue(undefined);
    const addMock = jest.fn().mockResolvedValue(undefined);

    const member = {
      id: "member_2",
      user: { tag: "yetkili#0002" },
      roles: {
        cache: memberRolesCache,
        remove: removeMock,
        add: addMock
      }
    } as any;

    await guard.enforceAction(guild, member, "channelDelete", 3, 2);

    expect(removeMock).toHaveBeenCalledTimes(1);
    const removedCollection = removeMock.mock.calls[0][0];
    expect(removedCollection.has("role_admin")).toBe(true);
    expect(removedCollection.has(querenciaId)).toBe(false);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("should support updating fallback role dynamically via updateFallbackRole", async () => {
    const newRoleId = "999999999999999999";
    const guard = new VedoAuditGuard([], [], "", "1574857531069567079");
    guard.updateFallbackRole(newRoleId);

    const guild = createMockGuild(true);
    const memberRolesCache = new Collection<string, any>([
      ["role_admin", { id: "role_admin", editable: true }]
    ]);

    const removeMock = jest.fn().mockResolvedValue(undefined);
    const addMock = jest.fn().mockResolvedValue(undefined);

    const member = {
      id: "member_3",
      user: { tag: "yetkili#0003" },
      roles: {
        cache: memberRolesCache,
        remove: removeMock,
        add: addMock
      }
    } as any;

    await guard.enforceAction(guild, member, "roleDelete", 3, 2);

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock.mock.calls[0][0].id).toBe(newRoleId);
  });
});
