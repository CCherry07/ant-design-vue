import type { ComputedRef } from 'vue';
import { unref, computed, defineComponent, ref, watch } from 'vue';
import type { VueNode } from '../../_util/type';
import type { ModalFuncProps } from '../Modal';
import type { HookModalRef } from './HookModal';
import type { ModalStaticFunctions } from '../confirm';
import { withConfirm, withError, withInfo, withSuccess, withWarn } from '../confirm';

import HookModal from './HookModal';
import destroyFns from '../destroyFns';

let uuid = 0;

interface ElementsHolderRef {
  addModal: (modal: ComputedRef<JSX.Element>) => () => void;
}

const ElementsHolder = defineComponent({
  name: 'ElementsHolder',
  inheritAttrs: false,
  setup(_, { expose }) {
    const modals = ref<ComputedRef<JSX.Element>[]>([]);
    const addModal = (modal: ComputedRef<JSX.Element>) => {
      modals.value.push(modal);
      return () => {
        modals.value = modals.value.filter(currentModal => currentModal !== modal);
      };
    };

    expose({ addModal });
    return () => {
      return <>{modals.value.map(modal => modal.value)}</>;
    };
  },
});

function useModal(): readonly [Omit<ModalStaticFunctions, 'warn'>, () => VueNode] {
  const holderRef = ref<ElementsHolderRef>(null);
  // ========================== Effect ==========================
  const actionQueue = ref([]);
  watch(
    actionQueue,
    () => {
      if (actionQueue.value.length) {
        const cloneQueue = [...actionQueue.value];
        cloneQueue.forEach(action => {
          action();
        });
        actionQueue.value = [];
      }
    },
    {
      immediate: true,
    },
  );

  // =========================== Hook ===========================
  const getConfirmFunc = (withFunc: (config: ModalFuncProps) => ModalFuncProps) =>
    function hookConfirm(config: ModalFuncProps) {
      uuid += 1;
      const open = ref(true);
      const modalRef = ref<HookModalRef>(null);
      const configRef = ref(unref(config));
      const updateConfig = ref({});
      watch(config, val => {
        updateAction({
          ...val,
          ...updateConfig.value,
        });
      });
      // eslint-disable-next-line prefer-const
      let closeFunc: Function | undefined;
      const modal = computed(() => (
        <HookModal
          key={`modal-${uuid}`}
          config={withFunc(configRef.value)}
          ref={modalRef}
          open={open.value}
          destroyAction={destroyAction}
          afterClose={() => {
            closeFunc?.();
          }}
        />
      ));

      closeFunc = holderRef.value?.addModal(modal);

      if (closeFunc) {
        destroyFns.push(closeFunc);
      }

      const destroyAction = (...args: any[]) => {
        open.value = false;
        const triggerCancel = args.some(param => param && param.triggerCancel);
        if (configRef.value.onCancel && triggerCancel) {
          configRef.value.onCancel(() => {}, ...args.slice(1));
        }
      };

      const updateAction = (newConfig: ModalFuncProps) => {
        configRef.value = {
          ...configRef.value,
          ...newConfig,
        };
      };

      const destroy = () => {
        if (modalRef.value) {
          destroyAction();
        } else {
          actionQueue.value = [...actionQueue.value, destroyAction];
        }
      };

      const update = (newConfig: ModalFuncProps) => {
        updateConfig.value = newConfig;
        if (modalRef.value) {
          updateAction(newConfig);
        } else {
          actionQueue.value = [...actionQueue.value, () => updateAction(newConfig)];
        }
      };
      return {
        destroy,
        update,
      };
    };

  const fns = computed(() => ({
    info: getConfirmFunc(withInfo),
    success: getConfirmFunc(withSuccess),
    error: getConfirmFunc(withError),
    warning: getConfirmFunc(withWarn),
    confirm: getConfirmFunc(withConfirm),
  }));

  return [fns.value, () => <ElementsHolder key="modal-holder" ref={holderRef} />] as const;
}

export default useModal;