import { create } from "zustand";
import { $fetch } from "@/lib/api";

interface UpdateData {
  status: boolean;
  message: string;
  changelog: string | null;
  update_id: string;
  version: string;
  filesUpdated?: number;
}

interface SystemUpdateStore {
  productId: string;
  productName: string;
  productVersion: string;
  licenseVerified: boolean;
  updateData: UpdateData;
  isUpdating: boolean;
  isUpdateChecking: boolean;
  setProductId: (id: string) => void;
  setProductName: (name: string) => void;
  setProductVersion: (version: string) => void;
  setLicenseVerified: (verified: boolean) => void;
  setUpdateData: (data: UpdateData) => void;
  setIsUpdating: (updating: boolean) => void;
  setIsUpdateChecking: (checking: boolean) => void;
  checkForUpdates: () => Promise<void>;
  updateSystem: () => Promise<void>;
  activateLicense: (
    purchaseCode: string,
    envatoUsername: string
  ) => Promise<void>;
  verifyLicense: () => Promise<void>;
  fetchProductInfo: () => Promise<void>;
}

export const useSystemUpdateStore = create<SystemUpdateStore>((set, get) => ({
  productId: "",
  productName: "bicrypto",
  productVersion: "",
  licenseVerified: false,
  updateData: {
    status: false,
    message: "",
    changelog: null,
    update_id: "",
    version: "",
    filesUpdated: 0,
  },
  isUpdating: false,
  isUpdateChecking: false,

  setProductId: (id) => set({ productId: id }),
  setProductName: (name) => set({ productName: name }),
  setProductVersion: (version) => set({ productVersion: version }),
  setLicenseVerified: (verified) => set({ licenseVerified: verified }),
  setUpdateData: (data) => set({ updateData: data }),
  setIsUpdating: (updating) => set({ isUpdating: updating }),
  setIsUpdateChecking: (checking) => set({ isUpdateChecking: checking }),

  checkForUpdates: async () => {
    const { productId, productVersion, setIsUpdateChecking, setUpdateData } =
      get();
    if (!productId || !productVersion) return;
    setIsUpdateChecking(true);

    const { data, error } = await $fetch({
      url: "/api/admin/system/update/check",
      method: "POST",
      body: { productId, currentVersion: productVersion },
      silent: true,
    });

    if (!error) {
      setUpdateData({
        ...data,
        message: data.message || "Update information retrieved.",
      });
    } else {
      setUpdateData({
        status: false,
        message:
          "Unable to retrieve update information due to a network error.",
        changelog: null,
        update_id: "",
        version: "",
      });
    }
    setIsUpdateChecking(false);
  },

  updateSystem: async () => {
    const {
      productId,
      productName,
      updateData,
      setIsUpdating,
      setProductVersion,
      setUpdateData,
    } = get();

    setIsUpdating(true);

    const { data, error } = await $fetch({
      url: "/api/admin/system/update/download",
      method: "POST",
      body: {
        productId,
        updateId: updateData.update_id,
        version: updateData.version,
        product: productName,
      },
      silent: true,
    });

    if (!error && data) {
      setProductVersion(updateData.version);
      const filesUpdated = data.data?.filesUpdated || 0;
      setUpdateData({
        ...updateData,
        status: false, // No more update available after successful update
        update_id: "",
        message: filesUpdated > 0
          ? `Update completed successfully. ${filesUpdated} files were updated.`
          : "Update completed successfully.",
        filesUpdated: filesUpdated,
      });
    } else {
      setUpdateData({
        ...updateData,
        message: error || "Failed to update system. Please try again later.",
      });
    }

    setIsUpdating(false);
  },

  activateLicense: async (purchaseCode: string, envatoUsername: string) => {
    const { productId, setLicenseVerified, setUpdateData } = get();
    const { data, error } = await $fetch({
      url: "/api/admin/system/license/activate",
      method: "POST",
      body: { productId, purchaseCode, envatoUsername },
      silent: true,
    });

    if (error) {
      const currentUpdateData = get().updateData;
      setUpdateData({
        ...currentUpdateData,
        message: error,
      });
      return;
    }

    setLicenseVerified(data.status);
    if (!data.status) {
      const currentUpdateData = get().updateData;
      setUpdateData({
        ...currentUpdateData,
        message: "License activation failed. Please check your details.",
      });
    }
  },

  verifyLicense: async () => {
    const { productId, setLicenseVerified } = get();
    if (!productId) return;

    const { data, error } = await $fetch({
      url: "/api/admin/system/license/verify",
      method: "POST",
      body: { productId },
      silent: true,
    });

    if (!error && data) {
      setLicenseVerified(data.status);
    } else {
      setLicenseVerified(false);
    }
  },

  fetchProductInfo: async () => {
    const { setProductId, setProductName, setProductVersion, verifyLicense } =
      get();
    const { data, error } = await $fetch({
      url: "/api/admin/system/product",
      silent: true,
    });
    if (!error) {
      setProductId(data.id);
      setProductName(data.name);
      setProductVersion(data.version);
      // Automatically verify license after fetching product info
      await verifyLicense();
    } else {
      console.error("Failed to fetch product info:", error);
    }
  },
}));
