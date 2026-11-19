// Stable database codes; retain readable API values for existing clients.
const UNIT_TYPE_CODES = Object.freeze({
    Union: 1, Mission: 2, District: 3, Local_Church: 4,
    Hospital: 5, School: 6, Services: 7,
});

function unitTypeLabelSql(column) {
    return `CASE ${column} ${Object.entries(UNIT_TYPE_CODES).map(([label, code]) => `WHEN ${code} THEN '${label}'`).join(' ')} END`;
}

module.exports = { UNIT_TYPE_CODES, unitTypeLabelSql };
