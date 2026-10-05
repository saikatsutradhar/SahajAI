const mongoose = require('mongoose');

const llmProviderSchema = new mongoose.Schema(
  {
    orderId: {
      type: Number,
      default: 1,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    providerType: {
      type: String,
      required: true,
      trim: true,
      default: 'custom',
    },
    modelName: {
      type: String,
      required: true,
      trim: true,
    },
    timeout: {
      type: Number,
      default: 600,
    },
    baseURL: {
      type: String,
      required: true,
      trim: true,
    },
    apiKey: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    lastTestStatus: {
      type: String,
      default: 'Not tested yet',
    },
    lastTestLatency: {
      type: Number,
    },
    lastTestTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

const LLMProvider =
  mongoose.models.LLMProvider || mongoose.model('LLMProvider', llmProviderSchema);

module.exports = LLMProvider;
