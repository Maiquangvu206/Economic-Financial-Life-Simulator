/**
 * Socket.IO room naming contract.
 * Every room is scoped and explicit; never broadcast game state globally.
 */
export const Rooms = {
  cityMap: (cityId: string) => `city_map_room:${cityId}`,
  stockMarket: () => 'stock_market_room',
  ticker: (tickerId: string) => `ticker_room:${tickerId}`,
  courtroom: (caseId: string) => `courtroom_session:${caseId}`,
  chat: (channelId: string) => `chat_room:${channelId}`,
  character: (characterId: string) => `character_room:${characterId}`,
  admin: () => 'admin_room',
  election: (electionId: string) => `election_room:${electionId}`,
} as const;

export type RoomName = ReturnType<(typeof Rooms)[keyof typeof Rooms]>;
