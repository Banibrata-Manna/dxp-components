import { modalController, toastController } from "@ionic/vue";
import { DateTime } from "luxon";
import { translate, useAuthStore } from "src";
import DxpGitBookSearch from "../components/DxpGitBookSearch.vue";
import { computed, ref } from "vue";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";
import { Scanner, Features, Group, Redirect } from '@shopify/app-bridge/actions';
import { client } from "@hotwax/oms-api";

declare var process: any;

const goToOms = (token: string, oms: string) => {
  const link = (oms.startsWith('http') ? oms.replace(/\/api\/?|\/$/, "") : `https://${oms}.hotwax.io`) + `/commerce/control/main?token=${token}`
  
  window.open(link, '_blank', 'noopener, noreferrer')
}

const getProductIdentificationValue = (productIdentifier: string, product: any) => {
  // handled this case as on page load initially the data is not available, so not to execute furthur code
  // untill product is not available
  if(!Object.keys(product).length) {
    return;
  }

  let value = product[productIdentifier]

  // considered that the goodIdentification will always have values in the format "productIdentifier/value" and there will be no entry like "productIdentifier/"
  const identification = product['goodIdentifications']?.find((identification: string) => identification.startsWith(productIdentifier + "/"))

  if(identification) {
    const goodIdentification = identification.split('/')
    value = goodIdentification[1]
  }

  return value;
}

const showToast = async (message: string, configButtons?: any) => {
  const defaultButtons = [{
    text: 'Dismiss',
    role: 'cancel'
  }]

  if (configButtons) defaultButtons.push(...configButtons);

  const toast = await toastController
    .create({
      message: message,
      duration: 3000,
      position: 'bottom',
      buttons: defaultButtons
    })
  return toast.present();
}

// TimeZone format = 04:16 PM EDT
const getCurrentTime = (zone: string, format = 't ZZZZ') => {
  return DateTime.now().setZone(zone).toFormat(format)
}

const getAppLoginUrl = () => {
  const authStore = useAuthStore();
  if (authStore.isEmbedded) {
    return `${process.env.VUE_APP_EMBEDDED_LAUNCHPAD_URL}/?shop=${authStore.shop}&host=${authStore.host}`
  } else {
    return process.env.VUE_APP_LOGIN_URL
  }
}

const createShopifyAppBridge = async (shop: string, host: string) => {
  try {
  // const host = new URLSearchParams(location.search).get('host') || "";
  // const shop = new URLSearchParams(location.search).get('shop') || "";

  // const authStore = useAuthStore();
  // authStore.shop = shop;
  // authStore.host = host;

  const apiKey = JSON.parse(process.env.VUE_APP_SHOPIFY_SHOP_CONFIG)[shop].apiKey;  
  const shopifyAppBridgeConfig = {
    apiKey: apiKey || '',
    host: host || '',
    forceRedirect: true,
  };
    
  const appBridge = createApp(shopifyAppBridgeConfig);

  return Promise.resolve(appBridge);      
  } catch (error) {
    return Promise.reject(error);
  }
}

// TODO: Move this to Utils
const getSessionTokenFromShopify = async (appBridgeConfig: any) => {
  try {
    if (appBridgeConfig) {
      const shopifySessionToken = await getSessionToken(appBridgeConfig);
      return Promise.resolve(shopifySessionToken);
    } else {
      throw new Error("Invalid App Config");
    }
  } catch (error) {
    return Promise.reject(error);
  }
}

const openPosScanner = async () => {
  try {
    const authStore = useAuthStore();
    const appBridgeConfig = await createShopifyAppBridge(authStore.shop, authStore.host);

    const scanner = Scanner.create(appBridgeConfig);

    console.log("This is Scanner", scanner);

    const features = Features.create(appBridgeConfig);

    console.log("These are features: ", features);

    // Subscribe to the update action (triggered when the permission dialog is interacted with)
    features.subscribe(Features.Action.REQUEST_UPDATE, function (payload) {
    console.log("This is payload: ", payload)

    if (payload.feature[Scanner.Action.OPEN_CAMERA]) {
      const available = payload.feature[Scanner.Action.OPEN_CAMERA].Dispatch;
      console.log("Is scanner available: ", available);

      // If the Camera Scanner actions were enabled, open a Scanner
      if (available) {
        scanner.dispatch(Scanner.Action.OPEN_CAMERA)
      }
    }
    });
    // Dispatch an action to request access to Scanner actions
    features.dispatch(Features.Action.REQUEST, {
    feature: Group.Scanner,
    action: Scanner.Action.OPEN_CAMERA
    });
  } catch(error) {
    console.log("Error: ", error);
  }
}

const getPackingSlipUrl = async (): Promise<any> => {
  try {
    const authStore = useAuthStore();
    const omstoken = authStore.token.value;

    console.log("This is auth state right now", omstoken);



    // Get packing slip from the server
    const resp = await client({
      url: "/fop/apps/pdf/PrintPackingSlip",
      method: "GET",
      baseURL: 'https://dev-maarg.hotwax.io',
      headers: {
        "Authorization": "Bearer " + omstoken,
        "Content-Type": "application/json"
      },
      params: {
        shipmentId: ["13099"]
      },
      responseType: "blob"
    });


    if (!resp || resp.status !== 200) {
      throw resp.data
    }

    // Generate local file URL for the blob received
    const pdfUrl = window.URL.createObjectURL(resp.data);

    console.log("This is pdf url: ", pdfUrl);

    const apiKey = JSON.parse(process.env.VUE_APP_SHOPIFY_SHOP_CONFIG)[authStore.shop].apiKey;  
    const shopifyAppBridgeConfig = {
      apiKey: apiKey || '',
      host: authStore.host || '',
      forceRedirect: true,
    };

    console.log("This is app config: ", shopifyAppBridgeConfig);

    const appBridge = createApp(shopifyAppBridgeConfig);

    console.log("This is the app config", appBridge)

    const redirect = Redirect.create(appBridge);

    redirect.dispatch(Redirect.Action.REMOTE, {
      url: pdfUrl,
      newContext: true,
    });

    console.log("This is the end.")

  } catch (err) {
    showToast(translate('Failed to print packing slip'))
    console.error("Failed to load packing slip", err)
  }
}

export {
  getCurrentTime,
  getProductIdentificationValue,
  goToOms,
  showToast,
  getAppLoginUrl,
  createShopifyAppBridge,
  getSessionTokenFromShopify,
  openPosScanner,
  getPackingSlipUrl
}