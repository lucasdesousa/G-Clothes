import fetch from "node-fetch";
import {
  Extension,
  HDirection,
  HPacket,
  GAsync,
  AwaitingPacket,
} from "gnode-api";
import { parseString } from "xml2js";

let extensionEnabled = false;
let selectableColors = [];
let selectedColorIndex = 0;
let originalUserGender = "M";
let originalFigureString;
let isHCMember = false;
let interval;

const extensionInfo = {
  name: "G-Wardrobe",
  description: "Clothes tools for fun",
  version: "1.0.0",
  author: "!K2",
};

const ext = new Extension(extensionInfo);
const gAsync = new GAsync(ext);

ext.run();

ext.on("socketdisconnect", () => {
  process.exit(0);
});

ext.interceptByNameOrHash(HDirection.TOSERVER, "Chat", onCommandSended);
ext.interceptByNameOrHash(HDirection.TOCLIENT, "UserObject", onUserObject);
ext.interceptByNameOrHash(
  HDirection.TOCLIENT,
  "ScrSendUserInfo",
  onHabboClubInfo
);

ext.on(
  "connect",
  (host, connectionPort, hotelVersion, clientIdentifier, clientType) => {
    switch (host) {
      case "game-br.habbo.com":
        fetchFigureSetIds("www.habbo.com.br");
        break;
      case "game-de.habbo.com":
        fetchFigureSetIds("www.habbo.de");
        break;
      case "game-es.habbo.com":
        fetchFigureSetIds("www.habbo.es");
        break;
      case "game-fi.habbo.com":
        fetchFigureSetIds("www.habbo.fi");
        break;
      case "game-fr.habbo.com":
        fetchFigureSetIds("www.habbo.fr");
        break;
      case "game-it.habbo.com":
        fetchFigureSetIds("www.habbo.it");
        break;
      case "game-nl.habbo.com":
        fetchFigureSetIds("www.habbo.nl");
        break;
      case "game-s2.habbo.com":
        fetchFigureSetIds("sandbox.habbo.com");
        break;
      case "game-tr.habbo.com":
        fetchFigureSetIds("www.habbo.com.tr");
        break;
      case "game-us.habbo.com":
        fetchFigureSetIds("www.habbo.com");
        break;
      default:
        fullFigureSetIdsPacket = undefined;
        break;
    }

    const infoPacket = new HPacket("{out:InfoRetrieve}");
    const hcPacket = new HPacket('{out:ScrGetUserInfo}{s:"habbo_club"}');
    ext.sendToServer(infoPacket);
    ext.sendToServer(hcPacket);
  }
);

function fetchFigureSetIds(hotel) {
  fetchAndParseXml(`https://${hotel}/gamedata/figuredata/1`).then(
    (furniData) => {
      const rawClothesColors =
        furniData.figuredata?.colors[0]?.palette[2]?.color ?? [];

      const clothesColors = rawClothesColors.map((item) => ({
        id: item["$"].id,
        index: item["$"].index,
        club: item["$"].club,
        selectable: item["$"].selectable,
        color: item["_"],
      }));

      const sortedClothesColors = sortColorsByRainbowOrder(clothesColors);

      const allowedClubs = isHCMember ? ["0", "2"] : ["0"];

      const filteredColors = sortedClothesColors.filter(
        (item) => item.selectable === "1" && allowedClubs.includes(item.club)
      );

      selectableColors = filteredColors;

      const chatPacket = new HPacket(
        `{in:Chat}{i:-1}{s:"G-Wardrobe sucessfully loaded! (${
          isHCMember ? "HC" : "Non-HC"
        })"}{i:0}{i:33}{i:0}{i:0}`
      );
      ext.sendToClient(chatPacket);
    }
  );
}

async function setColorsInterval() {
  if (extensionEnabled) {
    const infoPacket = new HPacket("{out:InfoRetrieve}");
    ext.sendToServer(infoPacket);

    await gAsync.awaitPacket(
      new AwaitingPacket("UserObject", HDirection.TOCLIENT, 2000).addCondition(
        (hPacket) => {
          let id, username;
          [id, username, originalFigureString, originalUserGender] =
            hPacket.read("iSSS");
          changeClothes();
          interval = setInterval(changeClothes, 5000);
        }
      )
    );
  } else {
    clearInterval(interval);
    interval = null;

    const packet = new HPacket(
      `{out:UpdateFigureData}{s:"${originalUserGender}"}{s:"${originalFigureString}"}`
    );
    setTimeout(() => {
      ext.sendToServer(packet);
    }, 5000);
  }
}

function changeClothes() {
  const actualColor = selectableColors[selectedColorIndex];

  const slicedFigureString = originalFigureString.split(".");
  slicedFigureString.forEach((element, index) => {
    const firstHyphenIndex = element.indexOf("-");
    const secondHyphenIndex = element.indexOf("-", firstHyphenIndex + 1);
    const type = element.substring(0, firstHyphenIndex);
    const colors = element.substring(secondHyphenIndex + 1);
    const cloth = element.substring(0, secondHyphenIndex + 1);

    if (["hd", "hr"].includes(type)) {
      return;
    }

    if (colors.indexOf("-") !== -1) {
      slicedFigureString[index] = `${cloth}${actualColor.id}-${actualColor.id}`;
    } else {
      slicedFigureString[index] = `${cloth}${actualColor.id}`;
    }
  });

  const figureString = slicedFigureString.join(".");

  const packet = new HPacket(
    `{out:UpdateFigureData}{s:"${originalUserGender}"}{s:"${figureString}"}`
  );
  ext.sendToServer(packet);

  if (selectedColorIndex >= selectableColors.length - 1) {
    selectedColorIndex = 0;
    return;
  }

  selectedColorIndex++;
}

function onCommandSended(hMessage) {
  const packet = hMessage.getPacket();
  const textMessage = packet.readString();

  if (textMessage === ":rgb") {
    hMessage.blocked = true;
    extensionEnabled = !extensionEnabled;

    setColorsInterval();
    const chatPacket = new HPacket(
      `{in:Chat}{i:-1}{s:"G-Wardrobe - RGB mode has been ${
        extensionEnabled ? "activated" : "deactivated"
      }"}{i:0}{i:33}{i:0}{i:0}`
    );
    ext.sendToClient(chatPacket);
  }
}

function onUserObject(hMessage) {
  let id, username;
  const packet = hMessage.getPacket();
  [id, username, originalFigureString, originalUserGender] =
    packet.read("iSSS");
}

function onHabboClubInfo(hMessage) {
  let name, period;
  const packet = hMessage.getPacket();
  [name, period] = packet.read("Si");

  isHCMember = period > 0 ? true : false;
}

async function fetchAndParseXml(url) {
  try {
    // Faz a requisição usando node-fetch
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Falha na requisição do XML");
    }

    // Lê o corpo da resposta como texto
    const xmlText = await response.text();

    // Faz o parse do XML usando xml2js
    let parsedXml;
    parseString(xmlText, (err, result) => {
      if (err) {
        throw err;
      }
      parsedXml = result;
    });

    // O parsedXml conterá o objeto JavaScript resultante do XML
    return parsedXml;
  } catch (err) {
    console.error("Erro:", err.message);
  }
}

function hexToRGB(hex) {
  // Extrai os valores hexadecimais para R, G e B
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return [r, g, b];
}

function RGBToHSL(rgb) {
  const [r, g, b] = rgb.map((value) => value / 255);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // A escala é de cinza
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return [h, s, l];
}

function sortColorsByRainbowOrder(colors) {
  // Converta as cores hex para RGB e, em seguida, para HSL
  const colorsHSL = colors.map((hexColor) => ({
    ...hexColor,
    color: RGBToHSL(hexToRGB(hexColor.color)),
  }));

  // Classifique as cores com base no valor H (Hue) da representação HSL
  colorsHSL.sort((a, b) => a[0]?.color - b[0]?.color);

  // Converta as cores de volta para hex
  const sortedColors = colorsHSL.map((hslColor) => {
    const [h, s, l] = hslColor.color;
    const rgb = [];
    const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const t1 = 2 * l - t2;
    for (let i = 0; i < 3; i++) {
      const t3 = h + (1 / 3) * -(i - 1);
      rgb[i] = Math.round(255 * (t3 < 0 ? t3 + 1 : t3 > 1 ? t3 - 1 : t3));
    }

    return {
      ...hslColor,
      color: `#${rgb
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")}`,
    };
  });

  return sortedColors;
}
