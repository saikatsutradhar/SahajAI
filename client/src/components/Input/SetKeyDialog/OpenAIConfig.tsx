import { useState } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import InputWithLabel from './InputWithLabel';

const OpenAIConfig = ({
  endpoint,
  userProvideURL,
}: {
  endpoint: EModelEndpoint | string;
  userProvideURL?: boolean | null;
}) => {
  const { control, setValue } = useFormContext();
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud');
  const isAzure = endpoint === EModelEndpoint.azureOpenAI;

  return (
    <form className="flex-wrap">
      {!isAzure && (
        <div className="my-3 flex w-full gap-1 rounded-xl border border-border-medium bg-surface-tertiary p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('cloud');
              setValue('apiType', 'cloud');
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-medium transition-all ${
              activeTab === 'cloud'
                ? 'border border-border-light/40 bg-surface-secondary text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>☁️</span> Cloud API
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('local');
              setValue('apiType', 'local');
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-medium transition-all ${
              activeTab === 'local'
                ? 'border border-border-light/40 bg-surface-secondary text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>🏠</span> Local LLM (mistral)
          </button>
        </div>
      )}

      {activeTab === 'cloud' && !isAzure && (
        <Controller
          name="apiKey"
          control={control}
          render={({ field }) => (
            <InputWithLabel
              id="apiKey"
              {...field}
              label={`${isAzure ? 'Azure ' : ''}OpenAI API Key`}
              labelClassName="mb-1"
              inputClassName="mb-2"
              secret
            />
          )}
        />
      )}

      {activeTab === 'local' && !isAzure && (
        <>
          <Controller
            name="localBaseURL"
            control={control}
            defaultValue="http://122.163.121.176:3041/v1"
            render={({ field }) => (
              <InputWithLabel
                id="localBaseURL"
                {...field}
                label="Local API Base URL"
                subLabel="(e.g., http://122.163.121.176:3041/v1)"
                labelClassName="mb-1"
                inputClassName="mb-2"
              />
            )}
          />
          <Controller
            name="localModelName"
            control={control}
            defaultValue="mistral:latest"
            render={({ field }) => (
              <InputWithLabel
                id="localModelName"
                {...field}
                label="Local Model Name"
                subLabel="(e.g., mistral:latest)"
                labelClassName="mb-1"
                inputClassName="mb-2"
              />
            )}
          />
          <Controller
            name="localKey"
            control={control}
            defaultValue=""
            render={({ field }) => (
              <InputWithLabel
                id="localKey"
                {...field}
                label="Local Key / Token"
                subLabel="(Optional for local servers)"
                labelClassName="mb-1"
                inputClassName="mb-2"
                secret
              />
            )}
          />
        </>
      )}

      {isAzure && (
        <>
          <Controller
            name="azureOpenAIApiKey"
            control={control}
            render={({ field }) => (
              <InputWithLabel
                id="azureOpenAIApiKey"
                {...field}
                label={'Azure OpenAI API Key'}
                labelClassName="mb-1"
                secret
              />
            )}
          />
          <div className="mt-3"></div>
          <Controller
            name="azureOpenAIApiInstanceName"
            control={control}
            render={({ field }) => (
              <InputWithLabel
                id="azureOpenAIApiInstanceName"
                {...field}
                label={'Azure OpenAI Instance Name'}
                labelClassName="mb-1"
              />
            )}
          />
          <div className="mt-3"></div>
          <Controller
            name="azureOpenAIApiDeploymentName"
            control={control}
            render={({ field }) => (
              <InputWithLabel
                id="azureOpenAIApiDeploymentName"
                {...field}
                label={'Azure OpenAI Deployment Name'}
                labelClassName="mb-1"
              />
            )}
          />
          <div className="mt-3"></div>
          <Controller
            name="azureOpenAIApiVersion"
            control={control}
            render={({ field }) => (
              <InputWithLabel
                id="azureOpenAIApiVersion"
                {...field}
                label={'Azure OpenAI API Version'}
                labelClassName="mb-1"
              />
            )}
          />
        </>
      )}

      {userProvideURL && activeTab === 'cloud' && (
        <div className="mt-3">
          <Controller
            name="baseURL"
            control={control}
            render={({ field }) => (
              <InputWithLabel
                id="baseURL"
                {...field}
                label={'API Base URL'}
                subLabel={'(Optional)'}
                labelClassName="mb-1"
              />
            )}
          />
        </div>
      )}
    </form>
  );
};

export default OpenAIConfig;
