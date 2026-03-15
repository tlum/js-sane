#include <napi.h>
#include <sane/sane.h>
#include <sane/saneopts.h>

#include <memory>
#include <string>
#include <vector>

namespace {

class SessionState {
 public:
  SessionState() : initialized_(false), version_code_(0) {}

  SANE_Status Init() {
    if (initialized_) {
      return SANE_STATUS_GOOD;
    }

    const SANE_Status status = sane_init(&version_code_, nullptr);
    if (status == SANE_STATUS_GOOD) {
      initialized_ = true;
    }

    return status;
  }

  void Exit() {
    if (initialized_) {
      sane_exit();
      initialized_ = false;
      version_code_ = 0;
    }
  }

  ~SessionState() { Exit(); }

  bool initialized() const { return initialized_; }
  SANE_Int version_code() const { return version_code_; }

 private:
  bool initialized_;
  SANE_Int version_code_;
};

SessionState g_session;

void ThrowSaneError(const Napi::Env& env, const char* context, SANE_Status status) {
  std::string message = std::string(context) + ": " + sane_strstatus(status);
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
}

std::string SafeString(const char* value) {
  return value == nullptr ? "" : value;
}

Napi::Object BuildVersionObject(const Napi::Env& env, SANE_Int code) {
  Napi::Object version = Napi::Object::New(env);
  version.Set("code", Napi::Number::New(env, code));
  version.Set("major", Napi::Number::New(env, SANE_VERSION_MAJOR(code)));
  version.Set("minor", Napi::Number::New(env, SANE_VERSION_MINOR(code)));
  version.Set("build", Napi::Number::New(env, SANE_VERSION_BUILD(code)));
  return version;
}

Napi::Object BuildDeviceObject(const Napi::Env& env, const SANE_Device* device) {
  Napi::Object entry = Napi::Object::New(env);
  entry.Set("name", Napi::String::New(env, SafeString(device->name)));
  entry.Set("vendor", Napi::String::New(env, SafeString(device->vendor)));
  entry.Set("model", Napi::String::New(env, SafeString(device->model)));
  entry.Set("type", Napi::String::New(env, SafeString(device->type)));
  return entry;
}

const char* OptionTypeName(SANE_Value_Type type) {
  switch (type) {
    case SANE_TYPE_BOOL:
      return "bool";
    case SANE_TYPE_INT:
      return "int";
    case SANE_TYPE_FIXED:
      return "fixed";
    case SANE_TYPE_STRING:
      return "string";
    case SANE_TYPE_BUTTON:
      return "button";
    case SANE_TYPE_GROUP:
      return "group";
    default:
      return "unknown";
  }
}

const char* OptionUnitName(SANE_Unit unit) {
  switch (unit) {
    case SANE_UNIT_NONE:
      return "none";
    case SANE_UNIT_PIXEL:
      return "pixel";
    case SANE_UNIT_BIT:
      return "bit";
    case SANE_UNIT_MM:
      return "mm";
    case SANE_UNIT_DPI:
      return "dpi";
    case SANE_UNIT_PERCENT:
      return "percent";
    case SANE_UNIT_MICROSECOND:
      return "microsecond";
    default:
      return "unknown";
  }
}

const char* FrameName(SANE_Frame frame) {
  switch (frame) {
    case SANE_FRAME_GRAY:
      return "gray";
    case SANE_FRAME_RGB:
      return "rgb";
    case SANE_FRAME_RED:
      return "red";
    case SANE_FRAME_GREEN:
      return "green";
    case SANE_FRAME_BLUE:
      return "blue";
    default:
      return "unknown";
  }
}

Napi::Value BuildConstraintValue(const Napi::Env& env, const SANE_Option_Descriptor* descriptor) {
  switch (descriptor->constraint_type) {
    case SANE_CONSTRAINT_NONE:
      return env.Null();
    case SANE_CONSTRAINT_RANGE: {
      Napi::Object range = Napi::Object::New(env);
      range.Set("type", "range");
      range.Set("min", descriptor->constraint.range->min);
      range.Set("max", descriptor->constraint.range->max);
      range.Set("quant", descriptor->constraint.range->quant);
      return range;
    }
    case SANE_CONSTRAINT_WORD_LIST: {
      const SANE_Word* words = descriptor->constraint.word_list;
      const int length = words == nullptr ? 0 : words[0];
      Napi::Object result = Napi::Object::New(env);
      Napi::Array values = Napi::Array::New(env, length);
      result.Set("type", "wordList");
      for (int i = 0; i < length; ++i) {
        values.Set(i, Napi::Number::New(env, words[i + 1]));
      }
      result.Set("values", values);
      return result;
    }
    case SANE_CONSTRAINT_STRING_LIST: {
      Napi::Object result = Napi::Object::New(env);
      Napi::Array values = Napi::Array::New(env);
      result.Set("type", "stringList");
      if (descriptor->constraint.string_list != nullptr) {
        uint32_t index = 0;
        for (const SANE_String_Const* current = descriptor->constraint.string_list; *current != nullptr;
             ++current, ++index) {
          values.Set(index, Napi::String::New(env, *current));
        }
      }
      result.Set("values", values);
      return result;
    }
    default:
      return env.Null();
  }
}

Napi::Object BuildOptionDescriptorObject(const Napi::Env& env, const SANE_Option_Descriptor* descriptor,
                                         int index) {
  Napi::Object option = Napi::Object::New(env);
  option.Set("index", index);
  option.Set("name", Napi::String::New(env, SafeString(descriptor->name)));
  option.Set("title", Napi::String::New(env, SafeString(descriptor->title)));
  option.Set("description", Napi::String::New(env, SafeString(descriptor->desc)));
  option.Set("type", Napi::String::New(env, OptionTypeName(descriptor->type)));
  option.Set("unit", Napi::String::New(env, OptionUnitName(descriptor->unit)));
  option.Set("size", Napi::Number::New(env, descriptor->size));
  option.Set("cap", Napi::Number::New(env, descriptor->cap));
  option.Set("isActive", Napi::Boolean::New(env, SANE_OPTION_IS_ACTIVE(descriptor->cap)));
  option.Set("isSettable", Napi::Boolean::New(env, SANE_OPTION_IS_SETTABLE(descriptor->cap)));
  option.Set("constraint", BuildConstraintValue(env, descriptor));
  return option;
}

Napi::Object BuildParametersObject(const Napi::Env& env, const SANE_Parameters& parameters) {
  Napi::Object result = Napi::Object::New(env);
  result.Set("format", Napi::String::New(env, FrameName(parameters.format)));
  result.Set("formatCode", Napi::Number::New(env, parameters.format));
  result.Set("lastFrame", Napi::Boolean::New(env, parameters.last_frame == SANE_TRUE));
  result.Set("bytesPerLine", Napi::Number::New(env, parameters.bytes_per_line));
  result.Set("pixelsPerLine", Napi::Number::New(env, parameters.pixels_per_line));
  result.Set("lines", Napi::Number::New(env, parameters.lines));
  result.Set("depth", Napi::Number::New(env, parameters.depth));
  return result;
}

Napi::Object BuildControlResultObject(const Napi::Env& env, SANE_Int info_flags, Napi::Value value) {
  Napi::Object result = Napi::Object::New(env);
  result.Set("info", Napi::Number::New(env, info_flags));
  result.Set("inexact", Napi::Boolean::New(env, (info_flags & SANE_INFO_INEXACT) != 0));
  result.Set("reloadOptions", Napi::Boolean::New(env, (info_flags & SANE_INFO_RELOAD_OPTIONS) != 0));
  result.Set("reloadParameters", Napi::Boolean::New(env, (info_flags & SANE_INFO_RELOAD_PARAMS) != 0));
  result.Set("value", value);
  return result;
}

const SANE_Option_Descriptor* FindOptionDescriptorByName(SANE_Handle device, const std::string& name,
                                                         int* index_out) {
  const SANE_Option_Descriptor* count_descriptor = sane_get_option_descriptor(device, 0);
  if (count_descriptor == nullptr) {
    return nullptr;
  }

  SANE_Int option_count = 0;
  SANE_Int info_flags = 0;
  const SANE_Status status =
      sane_control_option(device, 0, SANE_ACTION_GET_VALUE, &option_count, &info_flags);
  if (status != SANE_STATUS_GOOD) {
    return nullptr;
  }

  for (SANE_Int i = 0; i < option_count; ++i) {
    const SANE_Option_Descriptor* descriptor = sane_get_option_descriptor(device, i);
    if (descriptor == nullptr || descriptor->name == nullptr) {
      continue;
    }

    if (name == descriptor->name) {
      if (index_out != nullptr) {
        *index_out = i;
      }
      return descriptor;
    }
  }

  return nullptr;
}

const SANE_Option_Descriptor* ResolveOptionDescriptor(const Napi::Env& env, SANE_Handle device, Napi::Value key,
                                                      int* index_out) {
  if (key.IsNumber()) {
    const int index = key.As<Napi::Number>().Int32Value();
    if (index_out != nullptr) {
      *index_out = index;
    }
    return sane_get_option_descriptor(device, index);
  }

  if (key.IsString()) {
    const std::string name = key.As<Napi::String>().Utf8Value();
    return FindOptionDescriptorByName(device, name, index_out);
  }

  Napi::TypeError::New(env, "Option key must be a number or string").ThrowAsJavaScriptException();
  return nullptr;
}

Napi::Value ReadOptionValue(const Napi::Env& env, SANE_Handle device, int index,
                            const SANE_Option_Descriptor* descriptor) {
  if (descriptor == nullptr) {
    return env.Null();
  }

  if (!SANE_OPTION_IS_ACTIVE(descriptor->cap) || descriptor->type == SANE_TYPE_GROUP ||
      descriptor->type == SANE_TYPE_BUTTON || descriptor->size <= 0) {
    return env.Null();
  }

  std::vector<SANE_Byte> buffer(static_cast<size_t>(descriptor->size));
  SANE_Int info_flags = 0;
  const SANE_Status status =
      sane_control_option(device, index, SANE_ACTION_GET_VALUE, buffer.data(), &info_flags);
  if (status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_control_option failed while reading option value", status);
    return env.Null();
  }

  switch (descriptor->type) {
    case SANE_TYPE_BOOL:
      return Napi::Boolean::New(env, *reinterpret_cast<SANE_Bool*>(buffer.data()) == SANE_TRUE);
    case SANE_TYPE_INT:
      if (descriptor->size == static_cast<SANE_Int>(sizeof(SANE_Word))) {
        return Napi::Number::New(env, *reinterpret_cast<SANE_Word*>(buffer.data()));
      }
      break;
    case SANE_TYPE_FIXED:
      if (descriptor->size == static_cast<SANE_Int>(sizeof(SANE_Word))) {
        return Napi::Number::New(env, SANE_UNFIX(*reinterpret_cast<SANE_Word*>(buffer.data())));
      }
      break;
    case SANE_TYPE_STRING:
      return Napi::String::New(env, reinterpret_cast<char*>(buffer.data()));
    default:
      break;
  }

  if (descriptor->size % static_cast<SANE_Int>(sizeof(SANE_Word)) == 0) {
    const auto word_count = descriptor->size / static_cast<SANE_Int>(sizeof(SANE_Word));
    Napi::Array values = Napi::Array::New(env, word_count);
    const SANE_Word* words = reinterpret_cast<SANE_Word*>(buffer.data());
    for (int i = 0; i < word_count; ++i) {
      values.Set(i, Napi::Number::New(env, words[i]));
    }
    return values;
  }

  return env.Null();
}

bool WriteOptionValue(const Napi::Env& env, Napi::Value input, const SANE_Option_Descriptor* descriptor,
                      std::vector<SANE_Byte>* buffer_out) {
  if (descriptor->type == SANE_TYPE_BOOL) {
    if (!input.IsBoolean()) {
      Napi::TypeError::New(env, "Boolean option requires a boolean value").ThrowAsJavaScriptException();
      return false;
    }
    buffer_out->resize(sizeof(SANE_Bool));
    *reinterpret_cast<SANE_Bool*>(buffer_out->data()) =
        input.As<Napi::Boolean>().Value() ? SANE_TRUE : SANE_FALSE;
    return true;
  }

  if (descriptor->type == SANE_TYPE_INT || descriptor->type == SANE_TYPE_FIXED) {
    const auto element_size = sizeof(SANE_Word);
    if (descriptor->size == static_cast<SANE_Int>(element_size)) {
      if (!input.IsNumber()) {
        Napi::TypeError::New(env, "Numeric option requires a number").ThrowAsJavaScriptException();
        return false;
      }
      buffer_out->resize(element_size);
      const double number = input.As<Napi::Number>().DoubleValue();
      *reinterpret_cast<SANE_Word*>(buffer_out->data()) =
          descriptor->type == SANE_TYPE_FIXED ? SANE_FIX(number) : static_cast<SANE_Word>(number);
      return true;
    }

    if (!input.IsArray()) {
      Napi::TypeError::New(env, "Word-list option requires an array of numbers").ThrowAsJavaScriptException();
      return false;
    }

    Napi::Array values = input.As<Napi::Array>();
    if (values.Length() * element_size != static_cast<uint32_t>(descriptor->size)) {
      Napi::RangeError::New(env, "Array length does not match option size").ThrowAsJavaScriptException();
      return false;
    }

    buffer_out->resize(static_cast<size_t>(descriptor->size));
    auto* words = reinterpret_cast<SANE_Word*>(buffer_out->data());
    for (uint32_t i = 0; i < values.Length(); ++i) {
      Napi::Value entry = values.Get(i);
      if (!entry.IsNumber()) {
        Napi::TypeError::New(env, "Word-list option requires only numbers").ThrowAsJavaScriptException();
        return false;
      }
      const double number = entry.As<Napi::Number>().DoubleValue();
      words[i] = descriptor->type == SANE_TYPE_FIXED ? SANE_FIX(number) : static_cast<SANE_Word>(number);
    }
    return true;
  }

  if (descriptor->type == SANE_TYPE_STRING) {
    if (!input.IsString()) {
      Napi::TypeError::New(env, "String option requires a string value").ThrowAsJavaScriptException();
      return false;
    }
    const std::string value = input.As<Napi::String>().Utf8Value();
    if (value.size() + 1 > static_cast<size_t>(descriptor->size)) {
      Napi::RangeError::New(env, "String value exceeds option size").ThrowAsJavaScriptException();
      return false;
    }
    buffer_out->assign(static_cast<size_t>(descriptor->size), 0);
    std::copy(value.begin(), value.end(), buffer_out->begin());
    return true;
  }

  Napi::TypeError::New(env, "Option type is not writable with setOptionValue")
      .ThrowAsJavaScriptException();
  return false;
}

Napi::Value InitSession(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  const SANE_Status status = g_session.Init();
  if (status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_init failed", status);
    return env.Null();
  }

  return BuildVersionObject(env, g_session.version_code());
}

Napi::Value ExitSession(const Napi::CallbackInfo& info) {
  g_session.Exit();
  return info.Env().Undefined();
}

Napi::Value GetVersion(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  const SANE_Status status = g_session.Init();
  if (status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_init failed", status);
    return env.Null();
  }

  return BuildVersionObject(env, g_session.version_code());
}

Napi::Value ListDevices(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  const bool local_only =
      info.Length() > 0 && info[0].IsBoolean() ? info[0].As<Napi::Boolean>().Value() : false;

  const SANE_Status init_status = g_session.Init();
  if (init_status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_init failed", init_status);
    return env.Null();
  }

  const SANE_Device** devices = nullptr;
  const SANE_Status status = sane_get_devices(&devices, local_only ? SANE_TRUE : SANE_FALSE);
  if (status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_get_devices failed", status);
    return env.Null();
  }

  Napi::Array results = Napi::Array::New(env);
  if (devices == nullptr) {
    return results;
  }

  uint32_t index = 0;
  for (const SANE_Device** current = devices; *current != nullptr; ++current, ++index) {
    results.Set(index, BuildDeviceObject(env, *current));
  }

  return results;
}

class DeviceHandle : public Napi::ObjectWrap<DeviceHandle> {
 public:
  static Napi::FunctionReference constructor;

  static void InitClass(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(
        env, "SaneDeviceHandle",
        {
            InstanceMethod("close", &DeviceHandle::Close),
            InstanceMethod("getOptionDescriptors", &DeviceHandle::GetOptionDescriptors),
            InstanceMethod("getOptionValue", &DeviceHandle::GetOptionValue),
            InstanceMethod("getStatus", &DeviceHandle::GetStatus),
            InstanceMethod("getParameters", &DeviceHandle::GetParameters),
            InstanceMethod("setOptionValue", &DeviceHandle::SetOptionValue),
            InstanceMethod("setOptionAuto", &DeviceHandle::SetOptionAuto),
            InstanceMethod("triggerOption", &DeviceHandle::TriggerOption),
            InstanceMethod("start", &DeviceHandle::Start),
            InstanceMethod("read", &DeviceHandle::Read),
            InstanceMethod("cancel", &DeviceHandle::Cancel),
            InstanceMethod("setIoMode", &DeviceHandle::SetIoMode),
            InstanceMethod("getSelectFd", &DeviceHandle::GetSelectFd),
            InstanceAccessor("name", &DeviceHandle::GetName, nullptr),
        });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("SaneDeviceHandle", func);
  }

  DeviceHandle(const Napi::CallbackInfo& info) : Napi::ObjectWrap<DeviceHandle>(info), device_(nullptr) {
    if (info.Length() < 1 || !info[0].IsExternal()) {
      Napi::TypeError::New(info.Env(), "Internal constructor requires a SANE handle")
          .ThrowAsJavaScriptException();
      return;
    }

    device_ = info[0].As<Napi::External<void>>().Data();
    if (info.Length() > 1 && info[1].IsString()) {
      name_ = info[1].As<Napi::String>().Utf8Value();
    }
  }

  ~DeviceHandle() override { CloseHandle(); }

  static Napi::Object NewInstance(Napi::Env env, SANE_Handle device, const std::string& name) {
    return constructor.New({Napi::External<void>::New(env, device), Napi::String::New(env, name)});
  }

 private:
  void CloseHandle() {
    if (device_ != nullptr) {
      sane_close(device_);
      device_ = nullptr;
    }
  }

  Napi::Value Close(const Napi::CallbackInfo& info) {
    CloseHandle();
    return info.Env().Undefined();
  }

  Napi::Value GetOptionDescriptors(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    const SANE_Option_Descriptor* count_descriptor = sane_get_option_descriptor(device_, 0);
    if (count_descriptor == nullptr) {
      Napi::Error::New(env, "Unable to read SANE option count").ThrowAsJavaScriptException();
      return env.Null();
    }

    SANE_Int option_count = 0;
    SANE_Int info_flags = 0;
    SANE_Status status = sane_control_option(device_, 0, SANE_ACTION_GET_VALUE, &option_count, &info_flags);
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_control_option failed for option count", status);
      return env.Null();
    }

    Napi::Array options = Napi::Array::New(env, option_count);
    for (SANE_Int i = 0; i < option_count; ++i) {
      const SANE_Option_Descriptor* descriptor = sane_get_option_descriptor(device_, i);
      if (descriptor == nullptr) {
        options.Set(i, env.Null());
        continue;
      }

      options.Set(i, BuildOptionDescriptorObject(env, descriptor, i));
    }

    return options;
  }

  Napi::Value GetOptionValue(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    if (info.Length() < 1) {
      Napi::TypeError::New(env, "Option index or name is required").ThrowAsJavaScriptException();
      return env.Null();
    }

    int index = -1;
    const SANE_Option_Descriptor* descriptor = ResolveOptionDescriptor(env, device_, info[0], &index);
    if (env.IsExceptionPending()) {
      return env.Null();
    }

    if (descriptor == nullptr || index < 0) {
      return env.Null();
    }

    return ReadOptionValue(env, device_, index, descriptor);
  }

  Napi::Value SetOptionValue(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    if (info.Length() < 2) {
      Napi::TypeError::New(env, "Option key and value are required").ThrowAsJavaScriptException();
      return env.Null();
    }

    int index = -1;
    const SANE_Option_Descriptor* descriptor = ResolveOptionDescriptor(env, device_, info[0], &index);
    if (env.IsExceptionPending()) {
      return env.Null();
    }
    if (descriptor == nullptr || index < 0) {
      return env.Null();
    }
    if (!SANE_OPTION_IS_SETTABLE(descriptor->cap)) {
      Napi::Error::New(env, "Option is not settable").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::vector<SANE_Byte> buffer;
    if (!WriteOptionValue(env, info[1], descriptor, &buffer)) {
      return env.Null();
    }

    SANE_Int info_flags = 0;
    const SANE_Status status =
        sane_control_option(device_, index, SANE_ACTION_SET_VALUE, buffer.data(), &info_flags);
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_control_option failed while setting option value", status);
      return env.Null();
    }

    Napi::Value value = ReadOptionValue(env, device_, index, descriptor);
    if (env.IsExceptionPending()) {
      return env.Null();
    }
    return BuildControlResultObject(env, info_flags, value);
  }

  Napi::Value SetOptionAuto(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    if (info.Length() < 1) {
      Napi::TypeError::New(env, "Option key is required").ThrowAsJavaScriptException();
      return env.Null();
    }

    int index = -1;
    const SANE_Option_Descriptor* descriptor = ResolveOptionDescriptor(env, device_, info[0], &index);
    if (env.IsExceptionPending()) {
      return env.Null();
    }
    if (descriptor == nullptr || index < 0) {
      return env.Null();
    }
    if ((descriptor->cap & SANE_CAP_AUTOMATIC) == 0) {
      Napi::Error::New(env, "Option does not support automatic mode").ThrowAsJavaScriptException();
      return env.Null();
    }

    SANE_Int info_flags = 0;
    const SANE_Status status =
        sane_control_option(device_, index, SANE_ACTION_SET_AUTO, nullptr, &info_flags);
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_control_option failed while setting option auto mode", status);
      return env.Null();
    }

    Napi::Value value = ReadOptionValue(env, device_, index, descriptor);
    if (env.IsExceptionPending()) {
      return env.Null();
    }
    return BuildControlResultObject(env, info_flags, value);
  }

  Napi::Value TriggerOption(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    if (info.Length() < 1) {
      Napi::TypeError::New(env, "Option key is required").ThrowAsJavaScriptException();
      return env.Null();
    }

    int index = -1;
    const SANE_Option_Descriptor* descriptor = ResolveOptionDescriptor(env, device_, info[0], &index);
    if (env.IsExceptionPending()) {
      return env.Null();
    }
    if (descriptor == nullptr || index < 0) {
      return env.Null();
    }
    if (descriptor->type != SANE_TYPE_BUTTON) {
      Napi::Error::New(env, "Option is not a button").ThrowAsJavaScriptException();
      return env.Null();
    }

    SANE_Int info_flags = 0;
    const SANE_Status status =
        sane_control_option(device_, index, SANE_ACTION_SET_VALUE, nullptr, &info_flags);
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_control_option failed while triggering button option", status);
      return env.Null();
    }

    return BuildControlResultObject(env, info_flags, env.Null());
  }

  Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    struct StatusOption {
      const char* output_name;
      const char* option_name;
    };

    const StatusOption options[] = {
        {"pageLoaded", SANE_NAME_PAGE_LOADED},
        {"coverOpen", SANE_NAME_COVER_OPEN},
        {"warmup", SANE_NAME_WARMUP},
        {"scanButton", SANE_NAME_SCAN},
        {"emailButton", SANE_NAME_EMAIL},
        {"faxButton", SANE_NAME_FAX},
        {"copyButton", SANE_NAME_COPY},
        {"pdfButton", SANE_NAME_PDF},
        {"cancelButton", SANE_NAME_CANCEL},
    };

    Napi::Object result = Napi::Object::New(env);
    result.Set("deviceName", Napi::String::New(env, name_));

    for (const StatusOption& option : options) {
      int index = -1;
      const SANE_Option_Descriptor* descriptor = FindOptionDescriptorByName(device_, option.option_name, &index);
      if (descriptor == nullptr || index < 0) {
        continue;
      }

      Napi::Value value = ReadOptionValue(env, device_, index, descriptor);
      if (env.IsExceptionPending()) {
        return env.Null();
      }

      result.Set(option.output_name, value);
    }

    return result;
  }

  Napi::Value GetParameters(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    SANE_Parameters parameters;
    const SANE_Status status = sane_get_parameters(device_, &parameters);
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_get_parameters failed", status);
      return env.Null();
    }

    return BuildParametersObject(env, parameters);
  }

  Napi::Value Start(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    const SANE_Status start_status = sane_start(device_);
    if (start_status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_start failed", start_status);
      return env.Null();
    }

    SANE_Parameters parameters;
    const SANE_Status parameters_status = sane_get_parameters(device_, &parameters);
    if (parameters_status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_get_parameters failed after sane_start", parameters_status);
      return env.Null();
    }

    return BuildParametersObject(env, parameters);
  }

  Napi::Value Read(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    int32_t max_length = 32768;
    if (info.Length() > 0) {
      if (!info[0].IsNumber()) {
        Napi::TypeError::New(env, "read size must be a number").ThrowAsJavaScriptException();
        return env.Null();
      }
      max_length = info[0].As<Napi::Number>().Int32Value();
    }
    if (max_length <= 0) {
      Napi::RangeError::New(env, "read size must be positive").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::vector<SANE_Byte> buffer(static_cast<size_t>(max_length));
    SANE_Int bytes_read = 0;
    const SANE_Status status = sane_read(device_, buffer.data(), max_length, &bytes_read);
    if (status != SANE_STATUS_GOOD && status != SANE_STATUS_EOF) {
      ThrowSaneError(env, "sane_read failed", status);
      return env.Null();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("bytesRead", Napi::Number::New(env, bytes_read));
    result.Set("eof", Napi::Boolean::New(env, status == SANE_STATUS_EOF));
    result.Set("data", Napi::Buffer<SANE_Byte>::Copy(env, buffer.data(), static_cast<size_t>(bytes_read)));
    return result;
  }

  Napi::Value Cancel(const Napi::CallbackInfo& info) {
    if (device_ != nullptr) {
      sane_cancel(device_);
    }

    return info.Env().Undefined();
  }

  Napi::Value SetIoMode(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsBoolean()) {
      Napi::TypeError::New(env, "setIoMode requires a boolean").ThrowAsJavaScriptException();
      return env.Null();
    }

    const bool non_blocking = info[0].As<Napi::Boolean>().Value();
    const SANE_Status status = sane_set_io_mode(device_, non_blocking ? SANE_TRUE : SANE_FALSE);
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_set_io_mode failed", status);
      return env.Null();
    }
    return env.Undefined();
  }

  Napi::Value GetSelectFd(const Napi::CallbackInfo& info) {
    const Napi::Env env = info.Env();
    if (device_ == nullptr) {
      Napi::Error::New(env, "Device handle is closed").ThrowAsJavaScriptException();
      return env.Null();
    }

    SANE_Int fd = -1;
    const SANE_Status status = sane_get_select_fd(device_, &fd);
    if (status == SANE_STATUS_UNSUPPORTED) {
      return env.Null();
    }
    if (status != SANE_STATUS_GOOD) {
      ThrowSaneError(env, "sane_get_select_fd failed", status);
      return env.Null();
    }

    return Napi::Number::New(env, fd);
  }

  Napi::Value GetName(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), name_);
  }

  SANE_Handle device_;
  std::string name_;
};

Napi::FunctionReference DeviceHandle::constructor;

Napi::Value OpenDevice(const Napi::CallbackInfo& info) {
  const Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Device name must be a string").ThrowAsJavaScriptException();
    return env.Null();
  }

  const SANE_Status init_status = g_session.Init();
  if (init_status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_init failed", init_status);
    return env.Null();
  }

  const std::string name = info[0].As<Napi::String>().Utf8Value();
  auto handle = std::make_unique<SANE_Handle>(nullptr);
  const SANE_Status status = sane_open(name.c_str(), handle.get());
  if (status != SANE_STATUS_GOOD) {
    ThrowSaneError(env, "sane_open failed", status);
    return env.Null();
  }

  return DeviceHandle::NewInstance(env, handle.release(), name);
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  DeviceHandle::InitClass(env, exports);
  exports.Set("init", Napi::Function::New(env, InitSession));
  exports.Set("exit", Napi::Function::New(env, ExitSession));
  exports.Set("getVersion", Napi::Function::New(env, GetVersion));
  exports.Set("listDevices", Napi::Function::New(env, ListDevices));
  exports.Set("openDevice", Napi::Function::New(env, OpenDevice));
  return exports;
}

NODE_API_MODULE(js_sane, Init)
