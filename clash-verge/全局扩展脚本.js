// Define main function (script entry)

function main(config, profileName) {
  // 1. 修改 proxy-groups 中第一个组的名称为 PROXY
  if (config["proxy-groups"] && config["proxy-groups"].length > 0) {
    config["proxy-groups"][0].name = "PROXY";
  }

  // 2. 覆盖写入新的 rules
  config.rules = [
    "RULE-SET,applications,DIRECT",
    "DOMAIN,clash.razord.top,DIRECT",
    "DOMAIN,yacd.haishan.me,DIRECT",
    "RULE-SET,private,DIRECT",
    "RULE-SET,reject,REJECT",
    "RULE-SET,icloud,DIRECT",
    "RULE-SET,apple,DIRECT",
    "RULE-SET,google,PROXY",
    "RULE-SET,proxy,PROXY",
    "RULE-SET,direct,DIRECT",
    "RULE-SET,lancidr,DIRECT",
    "RULE-SET,cncidr,DIRECT",
    "RULE-SET,telegramcidr,PROXY",
    "GEOIP,LAN,DIRECT",
    "GEOIP,CN,DIRECT",
    "MATCH,PROXY"
  ];

  return config;
}
