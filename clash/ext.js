const main = (config) => {
  // 1. 覆写基础通用配置
  config['mixed-port'] = 7890;
  config['allow-lan'] = true;
  config['bind-address'] = '*';
  config['mode'] = 'rule';
  config['log-level'] = 'info';
  config['external-controller'] = '127.0.0.1:9090';
  config['unified-delay'] = true;
  config['tcp-concurrent'] = true;
  config['udp'] = true;
  config['ipv6'] = false;

  // 2. 覆写实验性功能配置 (experimental)
  config['experimental'] = {
    'ignore-resolve-fail': true,
    'cfw-latency-timeout': 8000,
    'cfw-latency-url': 'http://www.gstatic.com/generate_204',
    'cfw-conn-break-strategy': true
  };

  // 3. 覆写 profile 配置
  config['profile'] = {
    'store-selected': true
  };

  // 4. 动态写入 rule-providers (Loyalsoldier 经典规则集)
  config['rule-providers'] = {
    'reject': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt',
      'path': './ruleset/reject.yaml',
      'interval': 86400
    },
    'icloud': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/icloud.txt',
      'path': './ruleset/icloud.yaml',
      'interval': 86400
    },
    'apple': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/apple.txt',
      'path': './ruleset/apple.yaml',
      'interval': 86400
    },
    'google': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/google.txt',
      'path': './ruleset/google.yaml',
      'interval': 86400
    },
    'proxy': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt',
      'path': './ruleset/proxy.yaml',
      'interval': 86400
    },
    'direct': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt',
      'path': './ruleset/direct.yaml',
      'interval': 86400
    },
    'private': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/private.txt',
      'path': './ruleset/private.yaml',
      'interval': 86400
    },
    'gfw': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt',
      'path': './ruleset/gfw.yaml',
      'interval': 86400
    },
    'tld-not-cn': {
      'type': 'http',
      'behavior': 'domain',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/tld-not-cn.txt',
      'path': './ruleset/tld-not-cn.yaml',
      'interval': 86400
    },
    'telegramcidr': {
      'type': 'http',
      'behavior': 'ipcidr',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt',
      'path': './ruleset/telegramcidr.yaml',
      'interval': 86400
    },
    'cncidr': {
      'type': 'http',
      'behavior': 'ipcidr',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt',
      'path': './ruleset/cncidr.yaml',
      'interval': 86400
    },
    'lancidr': {
      'type': 'http',
      'behavior': 'ipcidr',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/lancidr.txt',
      'path': './ruleset/lancidr.yaml',
      'interval': 86400
    },
    'applications': {
      'type': 'http',
      'behavior': 'classical',
      'url': 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/applications.txt',
      'path': './ruleset/applications.yaml',
      'interval': 86400
    }
  };

  // 5. 修改订阅自带的 proxy-groups 中第一个策略组的名称为 "PROXY"
  // 提示：这要求你机场订阅里的第一个节点组（通常是自动选择、节点选择或第一个策略组）能成功更名
  if (config["proxy-groups"] && config["proxy-groups"].length > 0) {
    config["proxy-groups"][0].name = "PROXY";
  }

  // 6. 覆盖写入新的 rules 规则
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

  // 返回修改后的配置对象
  return config;
}
