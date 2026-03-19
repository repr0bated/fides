import {
  ChakraUseDisclosureReturn as UseDisclosureReturn,
  PageSpinner,
  useChakraToast as useToast,
} from "fidesui";

import { getErrorMessage } from "~/features/common/helpers";
import { useAlert } from "~/features/common/hooks";
import FormModal from "~/features/common/modals/FormModal";
import { DEFAULT_TOAST_PARAMS } from "~/features/common/toast";
import {
  useGetAvailableDatabasesByConnectionQuery,
  usePutDiscoveryMonitorMutation,
  useUpdateInfraMonitorRegionsMutation,
} from "~/features/data-discovery-and-detection/discovery-detection.slice";
import ConfigureAWSMonitorForm from "~/features/integrations/configure-monitor/ConfigureAWSMonitorForm";
import ConfigureAWSMonitorRegionsForm from "~/features/integrations/configure-monitor/ConfigureAWSMonitorRegionsForm";
import ConfigureMonitorDatabasesForm from "~/features/integrations/configure-monitor/ConfigureMonitorDatabasesForm";
import ConfigureMonitorForm from "~/features/integrations/configure-monitor/ConfigureMonitorForm";
import ConfigureWebsiteMonitorForm from "~/features/integrations/configure-monitor/ConfigureWebsiteMonitorForm";
import {
  ConnectionConfigurationResponseWithSystemKey,
  ConnectionSystemTypeMap,
  EditableMonitorConfig,
  MonitorFrequency,
} from "~/types/api";
import { isErrorResult, RTKResult } from "~/types/errors";

const TIMEOUT_DELAY = 5000;
const TIMEOUT_COPY =
  "Saving this monitor is taking longer than expected. Fides will continue processing it in the background, and you can check back later to view the updates.";

const WEBSITE_MONITOR_NOW_SCANNING_MESSAGE =
  "Your monitor has been created and is now scanning your website. Once the monitor is finished scanning, results can be found in the action center.";

const WEBSITE_MONITOR_NOT_SCHEDULED_MESSAGE = `Your monitor has been created with no schedule.  Select "Scan" in the table below to begin scanning your website.`;

const ConfigureMonitorModal = ({
  isOpen,
  onClose,
  formStep,
  onAdvance,
  monitor,
  isEditing,
  integration,
  integrationOption,
  isWebsiteMonitor,
  isAWSMonitor,
}: Pick<UseDisclosureReturn, "isOpen" | "onClose"> & {
  formStep: number;
  monitor?: EditableMonitorConfig;
  isEditing?: boolean;
  onAdvance: (m: EditableMonitorConfig) => void;
  integration: ConnectionConfigurationResponseWithSystemKey;
  integrationOption: ConnectionSystemTypeMap;
  isWebsiteMonitor?: boolean;
  isAWSMonitor?: boolean;
}) => {
  const [putMonitorMutationTrigger, { isLoading: isSubmitting }] =
    usePutDiscoveryMonitorMutation();

  const [updateInfraMonitorRegions, { isLoading: isUpdatingRegions }] =
    useUpdateInfraMonitorRegionsMutation();

  const { data: databases } = useGetAvailableDatabasesByConnectionQuery({
    page: 1,
    size: 25,
    connection_config_key: integration.key,
  });

  const databasesAvailable = !!databases && !!databases.total;

  const toast = useToast();

  const { successAlert, errorAlert } = useAlert();

  const handleSubmit = async (values: EditableMonitorConfig) => {
    let result: RTKResult | undefined;
    const timeout = setTimeout(() => {
      if (!result) {
        toast({
          ...DEFAULT_TOAST_PARAMS,
          status: "info",
          description: TIMEOUT_COPY,
        });
        onClose();
      }
    }, TIMEOUT_DELAY);

    result = await putMonitorMutationTrigger(values);

    if (result) {
      clearTimeout(timeout);
      if (isErrorResult(result)) {
        errorAlert(getErrorMessage(result.error), "Error creating monitor");
        return;
      }
      if (isEditing) {
        successAlert("Monitor updated successfully");
        onClose();
        return;
      }
      if (isWebsiteMonitor) {
        successAlert(
          values.execution_frequency === MonitorFrequency.NOT_SCHEDULED
            ? WEBSITE_MONITOR_NOT_SCHEDULED_MESSAGE
            : WEBSITE_MONITOR_NOW_SCANNING_MESSAGE,
        );
        onClose();
        return;
      }
      successAlert("Monitor created successfully");
      onClose();
    }
  };

  const handleAWSRegionsSubmit = async (regions: string[]) => {
    if (!monitor?.key) return;
    const result = await updateInfraMonitorRegions({ key: monitor.key, regions });
    if (isErrorResult(result)) {
      errorAlert(getErrorMessage(result.error), "Error updating regions");
      return;
    }
    successAlert("Monitor updated successfully");
    onClose();
  };

  // AWS step 0: save the monitor first, then advance to the regions picker with the saved key
  const handleAWSStep0Submit = async (values: EditableMonitorConfig) => {
    const result = await putMonitorMutationTrigger(values);
    if (isErrorResult(result)) {
      errorAlert(getErrorMessage(result.error), "Error saving monitor");
      return;
    }
    onAdvance({ ...values, key: (result.data as { key: string }).key } as EditableMonitorConfig);
  };

  if (isWebsiteMonitor) {
    return (
      <FormModal
        title={
          monitor?.name
            ? `Configure ${monitor.name}`
            : "Configure website monitor"
        }
        isOpen={isOpen}
        onClose={onClose}
      >
        <ConfigureWebsiteMonitorForm
          monitor={monitor}
          url={(integration.secrets as unknown as { url: string })?.url ?? ""}
          integrationSystem={integration?.system_key}
          onClose={onClose}
          onSubmit={handleSubmit}
        />
      </FormModal>
    );
  }

  if (isAWSMonitor) {
    return (
      <FormModal
        title={
          monitor?.name
            ? `Configure ${monitor.name}`
            : "Configure AWS monitor"
        }
        isOpen={isOpen}
        onClose={onClose}
      >
        {formStep === 0 && (
          <ConfigureAWSMonitorForm
            monitor={monitor}
            isSubmitting={isSubmitting}
            onClose={onClose}
            onSubmit={handleAWSStep0Submit}
          />
        )}
        {formStep === 1 &&
          (monitor?.key ? (
            <ConfigureAWSMonitorRegionsForm
              monitor={monitor}
              isSubmitting={isUpdatingRegions}
              onClose={onClose}
              onSubmit={handleAWSRegionsSubmit}
            />
          ) : (
            <PageSpinner />
          ))}
      </FormModal>
    );
  }

  return (
    <FormModal
      title={
        monitor?.name
          ? `Configure ${monitor.name}`
          : "Configure discovery monitor"
      }
      isOpen={isOpen}
      onClose={onClose}
    >
      {formStep === 0 && (
        <ConfigureMonitorForm
          monitor={monitor}
          onClose={onClose}
          onAdvance={onAdvance}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          databasesAvailable={databasesAvailable}
          integrationSystem={integration?.system_key}
          integrationOption={integrationOption}
        />
      )}
      {formStep === 1 &&
        (monitor ? (
          <ConfigureMonitorDatabasesForm
            monitor={monitor}
            isEditing={isEditing}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onClose={onClose}
            integrationKey={integration.key}
          />
        ) : (
          <PageSpinner />
        ))}
    </FormModal>
  );
};

export default ConfigureMonitorModal;
