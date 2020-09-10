import { FormStore, toFormLines, makeStore } from './form';
import modal from 'common/modal';
import debounce from 'common/debounce';
import * as xhr from 'common/xhr';
import LobbyController from './ctrl';

const li = window.lichess;

export default class Setup {

  stores: {
    hook: FormStore;
    friend: FormStore;
    ai: FormStore;
  }

  ratingRange = () => this.stores.hook.get()?.ratingRange;

  constructor(makeStorage: (name: string) => LichessStorage, readonly root: LobbyController) {
    this.stores = {
      hook: makeStore(makeStorage('lobby.setup.hook')),
      friend: makeStore(makeStorage('lobby.setup.friend')),
      ai: makeStore(makeStorage('lobby.setup.ai'))
    };
  }

  private save = (form: HTMLFormElement) =>
    this.stores[form.getAttribute('data-type')!].set(toFormLines(form));

  private sliderTimes = [
    0, 1 / 4, 1 / 2, 3 / 4, 1, 3 / 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 25, 30, 35, 40, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180
  ];

  private sliderTime = (v: number) => (v < this.sliderTimes.length ? this.sliderTimes[v] : 180);

  private sliderIncrement = (v: number) => {
    if (v <= 20) return v;
    switch (v) {
      case 21:
        return 25;
      case 22:
        return 30;
      case 23:
        return 35;
      case 24:
        return 40;
      case 25:
        return 45;
      case 26:
        return 60;
      case 27:
        return 90;
      case 28:
        return 120;
      case 29:
        return 150;
      default:
        return 180;
    }
  }

  private sliderDays = (v: number) => {
    if (v <= 3) return v;
    switch (v) {
      case 4:
        return 5;
      case 5:
        return 7;
      case 6:
        return 10;
      default:
        return 14;
    }
  }

  private sliderInitVal = (v: number, f: (x: number) => number, max: number) => {
    for (let i = 0; i < max; i++) {
      if (f(i) === v) return i;
    }
    return undefined;
  }

  private hookToPoolMember = (color: string, form: HTMLFormElement) => {
    const data = Array.from(new FormData(form).entries());
    const hash: any = {};
    for (let i in data) hash[data[i][0]] = data[i][1];
    const valid = color == 'random' && hash.variant == 1 && hash.mode == 1 && hash.timeMode == 1,
      id = parseFloat(hash.time) + '+' + parseInt(hash.increment);
    return (valid && this.root.pools.find(p => p.id === id)) ? {
      id,
      range: hash.ratingRange
    } : undefined;
  }

  prepareForm = ($modal: Cash) => {
    const self = this,
      $form = $modal.find('form'),
      $timeModeSelect = $form.find('#sf_timeMode'),
      $modeChoicesWrap = $form.find('.mode_choice'),
      $modeChoices = $modeChoicesWrap.find('input'),
      $casual = $modeChoices.eq(0),
      $rated = $modeChoices.eq(1),
      $variantSelect = $form.find('#sf_variant'),
      $fenPosition = $form.find(".fen_position"),
      $fenInput = $fenPosition.find('input'),
      forceFormPosition = !!$fenInput.val(),
      $timeInput = $form.find('.time_choice [name=time]'),
      $incrementInput = $form.find('.increment_choice [name=increment]'),
      $daysInput = $form.find('.days_choice [name=days]'),
      typ = $form.data('type'),
      $ratings = $modal.find('.ratings > div'),
      randomColorVariants = $form.data('random-color-variants').split(','),
      $submits = $form.find('.color-submits__button'),
      toggleButtons = () => {
        const variantId = $variantSelect.val(),
          timeMode = $timeModeSelect.val(),
          rated = $rated.prop('checked'),
          limit = parseFloat($timeInput.val() as string),
          inc = parseFloat($incrementInput.val() as string),
          // no rated variants with less than 30s on the clock
          cantBeRated = (timeMode == '1' && variantId != '1' && limit < 0.5 && inc == 0) ||
            (variantId != '1' && timeMode != '1');
        if (cantBeRated && rated) {
          $casual.trigger('click');
          return toggleButtons();
        }
        $rated.prop('disabled', !!cantBeRated).siblings('label').toggleClass('disabled', cantBeRated);
        const timeOk = timeMode != '1' || limit > 0 || inc > 0,
          ratedOk = typ != 'hook' || !rated || timeMode != '0',
          aiOk = typ != 'ai' || variantId != '3' || limit >= 1;
        if (timeOk && ratedOk && aiOk) {
          $submits.toggleClass('nope', false);
          $submits.filter(':not(.random)').toggle(!rated || !randomColorVariants.includes(variantId));
        } else $submits.toggleClass('nope', true);
      },
      save = function() {
        self.save($form[0] as HTMLFormElement);
      };

    const c = this.stores[typ].get();
    if (c) {
      Object.keys(c).forEach(k => {
        $form.find(`[name="${k}"]`).each(function(this: HTMLInputElement) {
          if (this.type == 'checkbox') this.checked = true;
          else if (this.type == 'radio') this.checked = this.value == c[k];
          else if (k != 'fen' || !this.value) this.value = c[k];
        });
      });
    }

    const showRating = () => {
      const timeMode = $timeModeSelect.val();
      let key: string = 'correspondence';
      switch ($variantSelect.val()) {
        case '1':
        case '3':
          if (timeMode == '1') {
            const time = parseFloat($timeInput.val() as string) * 60 + parseFloat($incrementInput.val() as string) * 40;
            if (time < 30) key = 'ultraBullet';
            else if (time < 180) key = 'bullet';
            else if (time < 480) key = 'blitz';
            else if (time < 1500) key = 'rapid';
            else key = 'classical';
          }
          break;
        case '10':
          key = 'crazyhouse';
          break;
        case '2':
          key = 'chess960';
          break;
        case '4':
          key = 'kingOfTheHill';
          break;
        case '5':
          key = 'threeCheck';
          break;
        case '6':
          key = 'antichess'
          break;
        case '7':
          key = 'atomic'
          break;
        case '8':
          key = "horde"
          break;
        case '9':
          key = "racingKings"
          break;
      }
      $ratings.hide().filter('.' + key).show();
      save();
    };
    if (typ == 'hook') {
      if ($form.data('anon')) {
        $timeModeSelect.val('1')
          .children('.timeMode_2, .timeMode_0')
          .prop('disabled', true)
          .attr('title', this.root.trans('youNeedAnAccountToDoThat'));
      }
      const ajaxSubmit = (color: string) => {
        const poolMember = this.hookToPoolMember(color, $form[0] as HTMLFormElement);
        modal.close();
        if (poolMember) {
          this.root.enterPool(poolMember);
          this.root.redraw();
        } else {
          this.root.setTab($timeModeSelect.val() === '1' ? 'real_time' : 'seeks');
          xhr.text(
            $form.attr('action')!.replace(/sri-placeholder/, li.sri),
            {
              method: 'post',
              body: (() => {
                const data = new FormData($form[0] as HTMLFormElement)
                data.append('color', color);
                return data;
              })()
            });
        }
        return false;
      };
      $submits.on('click', function(this: HTMLElement) {
        return ajaxSubmit($(this).val() as string);
      }).prop('disabled', false);
      $form.on('submit', () => ajaxSubmit('random'));
    } else $form.one('submit', $submits.hide);
    if (this.root.opts.blindMode) {
      $variantSelect[0]!.focus();
      $timeInput.add($incrementInput).on('change', () => {
        toggleButtons();
        showRating();
      });
    } else {
      $timeInput.add($incrementInput).each(function(this: HTMLInputElement) {
        const $input = $(this),
          $value = $input.siblings('span'),
          $range = $input.siblings('.range-slider'),
          range = $range[0] as HTMLInputElement,
          isTimeSlider = $input.parent().hasClass('time_choice'),
          showTime = (v: number) => {
            if (v == 1 / 4) return '¼';
            if (v == 1 / 2) return '½';
            if (v == 3 / 4) return '¾';
            return '' + v;
          },
          valueToTime = (v: number) => (isTimeSlider ? self.sliderTime : self.sliderIncrement)(v),
          show = (time: number) => $value.text(isTimeSlider ? showTime(time) : '' + time);
        show(parseFloat($input.val() as string));
        range.min = '0';
        range.max = '' + (isTimeSlider ? 38 : 30);
        range.value = '' + self.sliderInitVal(parseFloat($input.val() as string), isTimeSlider ? self.sliderTime : self.sliderIncrement, 100);
        $range.on('input', () => {
          const time = valueToTime(parseInt(range.value));
          show(time);
          $input.val('' + time);
          showRating();
          toggleButtons();
        });
      });
      $daysInput.each(function(this: HTMLInputElement) {
        var $input = $(this),
          $value = $input.siblings('span'),
          $range = $input.siblings('.range-slider'),
          range = $range[0] as HTMLInputElement;
        $value.text($input.val() as string);
        range.min = '1';
        range.max = '7';
        range.value = '' + self.sliderInitVal(parseInt($input.val() as string), self.sliderDays, 20);
        $range.on('input', () => {
          const days = self.sliderDays(parseInt(range.value));
          $value.text('' + days);
          $input.val('' + days);
          save();
        });
      });
      $form.find('.rating-range').each(function(this: HTMLElement) {
        const $this = $(this),
          $input = $this.find("input"),
          $span = $this.siblings("span.range"),
          min = $input.data("min"),
          max = $input.data("max"),
          values = $input.val() ? ($input.val() as string).split("-") : [min, max];

        $span.text(values.join('–'));
        /* $this.slider({ */
        /*   range: true, */
        /*   min: min, */
        /*   max: max, */
        /*   values: values, */
        /*   step: 50, */
        /*   slide(_: any, ui: { values: [number, number] }) { */
        /*     $input.val(ui.values[0] + "-" + ui.values[1]); */
        /*     $span.text(ui.values[0] + "–" + ui.values[1]); */
        /*     save(); */
        /*   } */
        /* }); */
      });
    }
    $timeModeSelect.on('change', function(this: HTMLElement) {
      var timeMode = $(this).val();
      $form.find('.time_choice, .increment_choice').toggle(timeMode == '1');
      $form.find('.days_choice').toggle(timeMode == '2');
      toggleButtons();
      showRating();
    }).trigger('change');

    var validateFen = debounce(() => {
      $fenInput.removeClass("success failure");
      var fen = $fenInput.val() as string;
      if (fen) xhr.text(xhr.url($fenInput.parent().data('validate-url'), { fen }))
        .then(data => {
          $fenInput.addClass("success");
          $fenPosition.find('.preview').html(data);
          $fenPosition.find('a.board_editor').each(function(this: HTMLAnchorElement) {
            this.href = this.href.replace(/editor\/.+$/, "editor/" + fen);
          });
          $submits.removeClass('nope');
          li.pubsub.emit('content_loaded');
        })
        .catch(() => {
          $fenInput.addClass("failure");
          $fenPosition.find('.preview').html("");
          $submits.addClass('nope');
        })
    }, 200);
    $fenInput.on('keyup', validateFen);

    if (forceFormPosition) $variantSelect.val('' + 3);
    $variantSelect.on('change', function(this: HTMLElement) {
      var isFen = $(this).val() == '3';
      $fenPosition.toggle(isFen);
      $modeChoicesWrap.toggle(!isFen);
      if (isFen) {
        $casual.trigger('click');
        requestAnimationFrame(() => document.body.dispatchEvent(new Event('chessground.resize')));
      }
      showRating();
      toggleButtons();
    }).trigger('change');

    $modeChoices.on('change', save);

    $form.find('div.level').each(function(this: HTMLElement) {
      var $infos = $(this).find('.ai_info > div');
      $(this).find('label').on('mouseenter', function(this: HTMLElement) {
        $infos.hide().filter('.' + $(this).attr('for')).show();
      });
      $(this).find('#config_level').on('mouseleave', function(this: HTMLElement) {
        var level = $(this).find('input:checked').val();
        $infos.hide().filter('.sf_level_' + level).show();
      }).trigger('mouseout');
      $(this).find('input').on('change', save);
    });
  }
}
