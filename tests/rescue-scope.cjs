// Superseding rescue changes are bounded against current main in rescue-scope.test.cjs.
exports.rescueSources = new Set(["src/app/page.tsx", "src/constants/ranks.ts", "src/lib/data.ts", "src/types/view-models.ts"]);
exports.rankLoaders = ['getHomeDashboard', 'getRecentMatchesWithRelations', 'attachHomeRecentRanks', 'logHomeDataFailure'];
