import ForgeUI, {
  render,
  Fragment,
  useState,
  useProductContext,
  Image,
  Button,
  Text,
  useConfig,
  TextField,
  ConfigForm,
  Macro,
} from "@forge/ui";
import api from "@forge/api";
import fetch from "node-fetch";
import axios from "axios";
import queryString from "querystring";
import arrayBufferToBuffer from "arraybuffer-to-buffer";
import url from "url";
import QRCode from "qrcode-svg";

// See README.md for details on generating a Translation API key
const { DEBUG_LOGGING } = process.env;

const API_URL = "https://s2c-forge.shashwat.workers.dev";

async function toDataUrlJira(downloadLink) {
  const attachmentPath = url.parse(downloadLink).pathname;
  return api
    .asUser()
    .requestJira(attachmentPath)
    .then((res) => res.arrayBuffer())
    .then(arrayBufferToBuffer)
    .then((res) => res.toString("base64"));
}

async function toDataUrl(downloadLink) {
  return fetch(downloadLink)
    .then((res) => res.arrayBuffer())
    .then(arrayBufferToBuffer)
    .then((res) => res.toString("base64"));
}

async function getHtmlCodeFromSketch(id, imgBase64, s2cApiUrl) {
  // const imgBase64 = await toDataUrl(sketchUrl);
  // console.log(sketchUrl);
  console.log("imgBase64: ", imgBase64);
  const saveRequestBody = { imgBase64 };
  const config = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  const saveResponse = await axios.post(
    `${s2cApiUrl}/SaveOriginalFile`,
    queryString.stringify(saveRequestBody),
    config
  );
  const {
    data: { folderId: correlationId },
  } = saveResponse;
  console.log("correlationId: ", correlationId);
  const qrCode = new QRCode({
    content: `${s2cApiUrl}/work-in-progress/${correlationId}`,
    width: 80,
    height: 80,
    padding: 0,
    color: "#00000",
    background: "#ffffff",
    ecl: "M",
  });
  const encodedSvg = new Buffer(qrCode.svg()).toString("base64");
  const dataUri = `data:image/svg+xml;base64,${encodedSvg}`;
  return { id, value: { correlationId, qrCode: dataUri } };
}

const Panel = () => {
  // Get the context issue key
  const {
    platformContext: { issueKey },
  } = useProductContext();
  // Set up a state object to hold attachments and results
  const [attachments, setAttachments] = useState([]);
  const [s2c, sets2c] = useState({});

  const generateCode = async () => {
    // Fetch attachments from Jira issue
    const issueResponse = await api
      .asApp()
      .requestJira(`/rest/api/2/issue/${issueKey}?fields=attachment`);
    await checkResponse("Jira API", issueResponse);
    const {
      fields: { attachment: issueAttachments },
    } = await issueResponse.json();
    setAttachments(issueAttachments);
    const s2cResponses = await Promise.all(
      issueAttachments.map(async (a) => {
        const imgBase64 = await toDataUrlJira(a.content);
        return getHtmlCodeFromSketch(a.id, imgBase64, API_URL);
      })
    );
    const s2cUpdate = {};
    s2cResponses.forEach((r) => (s2cUpdate[r.id] = r.value));
    sets2c(s2cUpdate);
  };

  // Render the UI
  return (
    <Fragment>
      <Button
        text={attachments.length ? "Reload" : "Generate Code"}
        onClick={generateCode}
      />
      {s2c && (
        <Fragment>
          {attachments.map((attachment) => {
            if (s2c[attachment.id])
              return (
                <Fragment>
                  <Text
                    format="markdown"
                    content={`**${attachment.filename}**`}
                  />
                  <Text
                    format="markdown"
                    content={`[Preview URL](${API_URL}/work-in-progress/${
                      s2c[attachment.id].correlationId
                    })`}
                  />
                  <Image
                    src={s2c[attachment.id].qrCode}
                    alt={s2c[attachment.id].correlationId}
                  />
                </Fragment>
              );
            else return <Fragment />;
          })}
        </Fragment>
      )}
    </Fragment>
  );
};

/**
 * Checks if a response was successful, and log and throw an error if not.
 * Also logs the response body if the DEBUG_LOGGING env variable is set.
 * @param apiName a human readable name for the API that returned the response object
 * @param response a response object returned from `api.fetch()`, `requestJira()`, or similar
 */
async function checkResponse(apiName, response) {
  if (!response.ok) {
    const message = `Error from ${apiName}: ${
      response.status
    } ${await response.text()}`;
    console.error(message);
    throw new Error(message);
  } else if (DEBUG_LOGGING) {
    console.debug(`Response from ${apiName}: ${await response.text()}`);
  }
}

export const run = render(<Panel />);

const Config = () => {
  return (
    <ConfigForm>
      <TextField isRequired={true} label="Sketch URL" name="url" />
    </ConfigForm>
  );
};

const S2CMacroApp = () => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const { url } = useConfig();
  const generateCode = async () => {
    let urlCopy = (" " + url).slice(1);
    const imgBase64 = await toDataUrl(urlCopy);
    console.log(imgBase64);
    const {
      value: { correlationId, qrCode },
    } = await getHtmlCodeFromSketch("macro-sketch", imgBase64, API_URL);
    setPreviewUrl(`${API_URL}/work-in-progress/${correlationId}`);
    setQrCode(qrCode);
  };
  return (
    <Fragment>
      {url && (
        <Fragment>
          <Image src={url} alt="ui-sketch" />
          <Button onClick={generateCode} text="Generate Code" />
        </Fragment>
      )}
      {previewUrl && (
        <Text format="markdown" content={`[Preview URL](${previewUrl})`} />
      )}
      {qrCode && <Image src={qrCode} alt={previewUrl} />}
    </Fragment>
  );
};

export const s2cMacro = render(
  <Macro
    app={<S2CMacroApp />}
    config={<Config />}
    defaultConfig={{
      url:
        "https://raw.githubusercontent.com/microsoft/ailab/master/Sketch2Code/model/images/094573f5-917f-4350-b8b5-3c828c834b57.png",
    }}
  />
);
